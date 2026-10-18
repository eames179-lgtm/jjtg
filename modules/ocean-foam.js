import * as THREE from "three";
import { OCEAN_FOAM } from "./config.js";
import { foamNoiseGLSL } from "./foam-noise.js";

// A small moving world-space field stores foam between frames. RGBA8 with
// linear decay avoids requiring float render targets or leaving quantized tails.
export function createOceanFoam(renderer, normals, waveShader, compact) {
  const resolution = compact ? 256 : 512;
  const worldSize = 512;
  const texelSize = worldSize / resolution;
  const targets = [0, 1].map((index) => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    target.texture.name = `OceanFoamHistory${index}`;
    target.texture.generateMipmaps = false;
    return target;
  });
  let read = targets[0];
  let write = targets[1];
  let lastTime;
  const origin = new THREE.Vector2();
  const uniforms = {
    surfaceFoamMap: { value: read.texture },
    surfaceFoamOrigin: { value: origin },
    surfaceFoamSize: { value: worldSize },
    surfaceFoamAmount: { value: OCEAN_FOAM.amount },
    surfaceFoamScale: { value: OCEAN_FOAM.textureScale },
    surfaceFoamDrift: { value: new THREE.Vector2(0.88, 0.47)
      .multiplyScalar(OCEAN_FOAM.driftSpeed) },
    surfaceFoamCrestHeight: { value: OCEAN_FOAM.crestHeight },
  };
  const simulation = new THREE.ShaderMaterial({
    uniforms: {
      uHistory: { value: read.texture },
      uNormals: { value: normals },
      uOrigin: { value: new THREE.Vector2() },
      uPreviousOrigin: { value: new THREE.Vector2() },
      uSize: { value: worldSize },
      uTexelSize: { value: texelSize },
      uTime: { value: 0 },
      uDelta: { value: 1 / 30 },
      uHasHistory: { value: 0 },
      uCrestHeight: { value: OCEAN_FOAM.crestHeight },
      uCoverage: { value: OCEAN_FOAM.coverage },
      uDriftSpeed: { value: OCEAN_FOAM.driftSpeed },
      uLifetime: { value: OCEAN_FOAM.lifetime },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uHistory;
      uniform sampler2D uNormals;
      uniform vec2 uOrigin;
      uniform vec2 uPreviousOrigin;
      uniform float uSize;
      uniform float uTexelSize;
      uniform float uTime;
      uniform float uDelta;
      uniform float uHasHistory;
      uniform float uCrestHeight;
      uniform float uCoverage;
      uniform float uDriftSpeed;
      uniform float uLifetime;
      varying vec2 vUv;
      ${waveShader}
      ${foamNoiseGLSL}
      vec2 flowAt(vec2 p) {
        mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);
        vec2 current = texture2D(uNormals, rotate * p * 0.0047
          + vec2(uTime * 0.0013, -uTime * 0.0017)).rg * 2.0 - 1.0;
        return (vec2(0.88, 0.47) + current * 0.8) * uDriftSpeed;
      }
      void main() {
        vec2 world = uOrigin + (vUv - 0.5) * uSize;
        vec2 flow = flowAt(world);
        vec2 previousUV = (world - flow * uDelta - uPreviousOrigin) / uSize + 0.5;
        float inside = step(0.0, previousUV.x) * step(previousUV.x, 1.0)
          * step(0.0, previousUV.y) * step(previousUV.y, 1.0);
        float history = texture2D(uHistory, clamp(previousUV, 0.0, 1.0)).r
          * inside * uHasHistory;
        float retained = max(0.0, history - uDelta / max(uLifetime, 0.1));
        vec4 wave = oceanSurface(world, uTime);
        float crest = smoothstep(uCrestHeight, uCrestHeight + 0.28, wave.x);
        float sharpness = smoothstep(0.018, 0.085, wave.w);
        vec2 flowX = flowAt(world + vec2(uTexelSize, 0.0));
        vec2 flowZ = flowAt(world + vec2(0.0, uTexelSize));
        float convergence = max(0.0, (flow.x - flowX.x + flow.y - flowZ.y) / uTexelSize);
        float focus = smoothstep(0.008, 0.10, convergence);
        vec2 patchPosition = (world - vec2(0.88, 0.47) * uTime * uDriftSpeed)
          * 0.055 + flow * 0.45;
        vec2 patchWarp = vec2(foamNoise(patchPosition * 0.67),
          foamNoise(patchPosition * 0.67 + vec2(31.7, 9.2))) - 0.5;
        float patchValue = foamFbm(patchPosition + patchWarp * 1.8);
        float coverage = clamp(uCoverage, 0.0, 1.0);
        float threshold = mix(1.14, -0.14, coverage);
        float islands = smoothstep(threshold - 0.14, threshold + 0.14, patchValue);
        float source = crest * sharpness * islands * (0.75 + focus * 0.5);
        float density = clamp(retained + source * uDelta * 1.8, 0.0, 1.0);
        gl_FragColor = vec4(density, 0.0, 0.0, 1.0);
      }
    `,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simulation);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.Camera();

  function update(time, viewCamera) {
    // Updating at 30 Hz limits the extra pass on mobile. Density is time-based.
    if (lastTime !== undefined && time >= lastTime && time - lastTime < 1 / 30) return;
    const hasHistory = lastTime !== undefined && time >= lastTime;
    const delta = hasHistory ? Math.min(time - lastTime, 0.1) : 1 / 30;
    const u = simulation.uniforms;
    u.uHistory.value = read.texture;
    u.uPreviousOrigin.value.copy(origin);
    u.uOrigin.value.set(
      Math.round(viewCamera.position.x / texelSize) * texelSize,
      Math.round(viewCamera.position.z / texelSize) * texelSize,
    );
    u.uTime.value = time;
    u.uDelta.value = delta;
    u.uHasHistory.value = hasHistory ? 1 : 0;
    u.uCrestHeight.value = OCEAN_FOAM.crestHeight;
    u.uCoverage.value = OCEAN_FOAM.coverage;
    u.uDriftSpeed.value = OCEAN_FOAM.driftSpeed;
    u.uLifetime.value = OCEAN_FOAM.lifetime;
    const previousTarget = renderer.getRenderTarget();
    const previousXR = renderer.xr.enabled;
    try {
      renderer.xr.enabled = false;
      renderer.setRenderTarget(write);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.xr.enabled = previousXR;
    }
    [read, write] = [write, read];
    origin.copy(u.uOrigin.value);
    uniforms.surfaceFoamMap.value = read.texture;
    uniforms.surfaceFoamAmount.value = OCEAN_FOAM.amount;
    uniforms.surfaceFoamScale.value = OCEAN_FOAM.textureScale;
    uniforms.surfaceFoamDrift.value.set(0.88, 0.47).multiplyScalar(OCEAN_FOAM.driftSpeed);
    uniforms.surfaceFoamCrestHeight.value = OCEAN_FOAM.crestHeight;
    lastTime = time;
  }

  function dispose() {
    targets.forEach((target) => target.dispose());
    quad.geometry.dispose();
    simulation.dispose();
  }

  return { uniforms, update, dispose };
}
