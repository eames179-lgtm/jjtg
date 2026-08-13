import * as THREE from "three";
import { WAKE } from "./config.js";

export function createWakeSystem(scene) {
  const samples = [];
  const stern = new THREE.Vector3();
  const right = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let wake;
  let sternOffset = 7.0;
  let baseHalfWidth = 2.8;

  function setVesselSize(size) {
    sternOffset = THREE.MathUtils.clamp(size.z * 0.43, 5.0, 14.0);
    baseHalfWidth = THREE.MathUtils.clamp(size.x * 0.34, 2.2, 5.2);
  }

  function create(foamTexture) {
    const vertexCount = WAKE.maxSections * 2;
    const positions = new Float32Array(vertexCount * 3);
    const ages = new Float32Array(vertexCount);
    const across = new Float32Array(vertexCount);
    const strengths = new Float32Array(vertexCount);
    const indices = new Uint16Array((WAKE.maxSections - 1) * 6);

    for (let i = 0; i < WAKE.maxSections; i++) {
      across[i * 2] = -1;
      across[i * 2 + 1] = 1;
    }
    for (let i = 0; i < WAKE.maxSections - 1; i++) {
      const v = i * 2;
      const o = i * 6;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], o);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "aAge",
      new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute("aAcross", new THREE.BufferAttribute(across, 1));
    geometry.setAttribute(
      "aStrength",
      new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFoamColor: { value: new THREE.Color(0xffffff) },
        uFoamTexture: { value: foamTexture },
      },
      vertexShader: `
        attribute float aAge;
        attribute float aAcross;
        attribute float aStrength;
        varying float vAge;
        varying float vAcross;
        varying float vStrength;
        varying vec2 vWorldXZ;

        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vAge = aAge;
          vAcross = aAcross;
          vStrength = aStrength;
          vWorldXZ = world.xz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uFoamColor;
        uniform sampler2D uFoamTexture;
        varying float vAge;
        varying float vAcross;
        varying float vStrength;
        varying vec2 vWorldXZ;

        void main() {
          float lateral = abs(vAcross);
          float fadeTail = 1.0 - smoothstep(0.62, 1.0, vAge);

          vec2 uvA = vWorldXZ * 0.07 + vec2(uTime * 0.1, -uTime * 0.018);
          mat2 rotateUV = mat2(0.80, -0.60, 0.60, 0.80);
          vec2 uvB = rotateUV * vWorldXZ * 0.24
                   + vec2(-uTime * 0.021, uTime * 0.014);
          float foamA = texture2D(uFoamTexture, uvA).r;
          float foamB = texture2D(uFoamTexture, uvB).r;
          float foamTexture = smoothstep(0.05, 0.5, foamA * (0.58 + foamB));
          float edgeNoise = mix(foamA, foamB, 0.5);
          float edgeStart = mix(0.40, 0.62, edgeNoise);

          float fadeSides = 1.0 - smoothstep(edgeStart, 1.0, lateral);
          fadeSides = pow(fadeSides, 1.25);

          float centre = 1.0 - smoothstep(0.04, 0.64, lateral);
          float railPosition = mix(0.58, 0.78, smoothstep(0.0, 0.7, vAge));
          float rails = 1.0 - smoothstep(0.035, 0.4, abs(lateral - railPosition));
          float sternBurst = (1.0 - smoothstep(0.0, 0.20, vAge))
                           * (1.0 - smoothstep(0.68, 0.98, lateral));

          float shape = centre * 0.48 + rails * 0.72 + sternBurst * 0.30;
          float alpha = clamp(
            shape * foamTexture * fadeTail * fadeSides * vStrength * 1.5,
            0.0,
            0.8
          );
          if (alpha < 0.025) discard;

          vec3 color = mix(uFoamColor * 0.90, vec3(0.96, 1.0, 0.98), foamA);
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

    wake = new THREE.Mesh(geometry, material);
    wake.name = "ProceduralWake";
    wake.frustumCulled = false;
    wake.renderOrder = 2;
    scene.add(wake);
  }

  function update(player, currentSpeed, elapsed) {
    if (!wake || !player) return;

    const speedRatio = THREE.MathUtils.clamp(currentSpeed / 26, 0, 1);
    forward
      .set(0, 0, 1)
      .applyQuaternion(player.quaternion)
      .setY(0)
      .normalize();
    stern
      .copy(player.position)
      .addScaledVector(forward, sternOffset * 0.15)
      .setY(WAKE.surfaceY);

    const newest = samples[samples.length - 1];
    if (
      speedRatio > 0.035 &&
      (!newest || newest.position.distanceTo(stern) >= WAKE.sampleSpacing)
    ) {
      samples.push({
        position: stern.clone(),
        forward: forward.clone(),
        time: elapsed,
        strength: THREE.MathUtils.smoothstep(speedRatio, 0.02, 0.72),
      });
      if (samples.length > WAKE.maxSections) samples.shift();
    }

    while (samples.length && elapsed - samples[0].time > WAKE.lifetime) {
      samples.shift();
    }

    const geometry = wake.geometry;
    const position = geometry.attributes.position;
    const age = geometry.attributes.aAge;
    const strength = geometry.attributes.aStrength;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const normalizedAge = THREE.MathUtils.clamp(
        (elapsed - sample.time) / WAKE.lifetime,
        0,
        1,
      );
      const halfWidth = THREE.MathUtils.lerp(
        baseHalfWidth,
        WAKE.maxHalfWidth,
        Math.pow(normalizedAge, 0.68),
      );
      right.set(sample.forward.z, 0, -sample.forward.x);

      position.setXYZ(
        i * 2,
        sample.position.x - right.x * halfWidth,
        WAKE.surfaceY,
        sample.position.z - right.z * halfWidth,
      );
      position.setXYZ(
        i * 2 + 1,
        sample.position.x + right.x * halfWidth,
        WAKE.surfaceY,
        sample.position.z + right.z * halfWidth,
      );
      age.setX(i * 2, normalizedAge);
      age.setX(i * 2 + 1, normalizedAge);
      strength.setX(i * 2, sample.strength);
      strength.setX(i * 2 + 1, sample.strength);
    }

    position.needsUpdate = true;
    age.needsUpdate = true;
    strength.needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, samples.length - 1) * 6);
    wake.material.uniforms.uTime.value = elapsed;
  }

  return { create, setVesselSize, update };
}
