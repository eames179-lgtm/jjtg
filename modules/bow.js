import * as THREE from "three";
import { oceanWaveGLSL, oceanQuality } from "./ocean.js";
import { foamPatternGLSL } from "./foam-noise.js";

export function createBowEffects(scene, foamTexture) {
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uLength: { value: 7 },
    uWidth: { value: 2.8 },
    uFoam: { value: foamTexture },
    uPixelRatio: { value: Math.min(devicePixelRatio, oceanQuality.pixelRatio) },
  };
  const group = new THREE.Group();
  group.name = "BowFoamAndSpray";
  scene.add(group);
  const foamMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      uniform float uLength;
      uniform float uWidth;
      varying vec2 vUv;
      varying vec2 vWorld;
      ${oceanWaveGLSL}
      void main() {
        vUv = uv;
        // position.x encodes port/starboard, position.y the strip width.
        float side = sign(position.x);
        float along = uv.y;
        float width = uWidth * (0.12 + along * 1.7);
        vec3 local = vec3(side * (width + position.y * (0.3 + along * 2.0)), 0.0, uLength * (1.0 - along * 1.8));
        vec4 world = modelMatrix * vec4(local, 1.0);
        world.y = oceanField(world.xz, uTime).x + 0.16;
        vWorld = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uFoam;
      uniform float uTime;
      uniform float uSpeed;
      varying vec2 vUv;
      varying vec2 vWorld;
      ${foamPatternGLSL}
      void main() {
        vec2 foam = foamPattern(uFoam, vWorld * 0.24
          + vec2(uTime * 0.07, -uTime * 0.05), uTime);
        float edge = sin(vUv.x * 3.14159265);
        float tail = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
        float alpha = smoothstep(0.12, 0.65, foam.x) * mix(0.5, 1.2, foam.y)
          * edge * tail * uSpeed * 0.85;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(0.8, 0.93, 0.94, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  for (const side of [-1, 1]) {
    const geometry = new THREE.PlaneGeometry(1, 1, 6, 24);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(i, side, geometry.attributes.uv.getX(i) - 0.5, 0);
    }
    const mesh = new THREE.Mesh(geometry, foamMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
  }

  const count = oceanQuality.compact ? 48 : 96;
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds.set([i / count, (i * 0.61803398875) % 1, i % 2 ? 1 : -1], i * 3);
  }
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  const sprayMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uLength;
      uniform float uWidth;
      uniform float uPixelRatio;
      varying float vAlpha;
      ${oceanWaveGLSL}
      void main() {
        float age = fract(position.x + uTime * 0.85);
        float launch = (0.8 + position.y * 1.8) * uSpeed;
        vec3 local = vec3(position.z * (uWidth * 0.3 + age * launch * 2.4), 0.0, uLength * 0.9 - age * (3.0 + uSpeed * 5.0));
        vec4 world = modelMatrix * vec4(local, 1.0);
        world.y = oceanField(world.xz, uTime).x + 0.2 + sin(age * 3.14159265) * launch;
        vec4 view = viewMatrix * world;
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp((90.0 + position.y * 100.0) * uPixelRatio / max(-view.z, 1.0), 1.0, 9.0);
        vAlpha = sin(age * 3.14159265) * uSpeed * 0.4;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = (1.0 - smoothstep(0.15, 1.0, radius)) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(0.85, 0.95, 1.0, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const spray = new THREE.Points(sprayGeometry, sprayMaterial);
  spray.frustumCulled = false;
  spray.renderOrder = 4;
  group.add(spray);

  return {
    update(player, speed, time, length, width) {
      group.visible = speed > 0.1;
      group.position.set(player.position.x, 0, player.position.z);
      group.rotation.y = player.rotation.y;
      uniforms.uTime.value = time;
      uniforms.uSpeed.value = THREE.MathUtils.smoothstep(speed / 26, 0.02, 0.9);
      uniforms.uLength.value = length;
      uniforms.uWidth.value = width;
    },
  };
}
