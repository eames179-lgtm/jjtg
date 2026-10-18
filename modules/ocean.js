import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { createOceanFoam } from "./ocean-foam.js";
import { foamPatternGLSL } from "./foam-noise.js";
import { needsCompatibleLighting } from "./model-materials.js";

// Shared spectrum: GPU surface and CPU buoyancy use identical phase and height.
// Metres, seconds. Most energy follows one wind direction; perpendicular sine
// trains made a visible crosshatch. Bent wave fronts break up the remaining rows.
const waves = [
  [0.94, 0.34, 0.4, 64, 0.2],
  [0.78, 0.63, 0.22, 39, 1.7],
  [0.99, -0.14, 0.12, 23, 3.1],
  [0.67, 0.74, 0.065, 13.7, 0.8],
  [0.89, 0.46, 0.035, 8.1, 2.4],
  [0.97, -0.24, 0.018, 4.7, 4.2],
].map(([x, z, amplitude, wavelength, phase]) => {
  const length = Math.hypot(x, z);
  const k = (2 * Math.PI) / wavelength;
  return {
    x: x / length,
    z: z / length,
    amplitude,
    k,
    omega: Math.sqrt(9.81 * k),
    phase,
  };
});

export const oceanQuality = {
  compact:
    matchMedia("(pointer: coarse)").matches ||
    (navigator.hardwareConcurrency || 8) <= 4,
};
oceanQuality.segments = oceanQuality.compact ? 160 : 256;
oceanQuality.reflectionSize = oceanQuality.compact ? 512 : 1024;
oceanQuality.pixelRatio = oceanQuality.compact ? 1.25 : 1.75;

export function sampleOceanHeight(x, z, time) {
  let height = 0;
  for (const w of waves) {
    const bend =
      w.k * 0.47 * (-w.z * x + w.x * z) - w.omega * 0.21 * time + w.phase * 1.7;
    const phase =
      w.k * (w.x * x + w.z * z) -
      w.omega * time +
      w.phase +
      1.15 * Math.sin(bend);
    height += w.amplitude * Math.sin(phase);
  }
  return height;
}

const number = (value) => value.toFixed(8);
// The fourth component is a crest-focusing proxy used only to seed whitecaps.
// Existing height/gradient consumers keep using the oceanField() wrapper.
export const oceanWaveGLSL = `
  vec4 oceanSurface(vec2 p, float t) {
    vec4 field = vec4(0.0);
    float phase;
    float bend;
    vec2 gradient;
    ${waves
      .map(
        (w) => `
      bend = ${number(w.k * 0.47)} * dot(p, vec2(${number(-w.z)}, ${number(w.x)})) - ${number(w.omega * 0.21)} * t + ${number(w.phase * 1.7)};
      phase = ${number(w.k)} * dot(p, vec2(${number(w.x)}, ${number(w.z)})) - ${number(w.omega)} * t + ${number(w.phase)} + 1.15 * sin(bend);
      field.x += ${number(w.amplitude)} * sin(phase);
      field.w += ${number(w.amplitude * w.k * Math.min(1, (2 * Math.PI) / w.k / 10))} * sin(phase);
      gradient = ${number(w.k)} * vec2(${number(w.x)}, ${number(w.z)})
        + ${number(w.k * 0.47 * 1.15)} * cos(bend) * vec2(${number(-w.z)}, ${number(w.x)});
      field.yz += ${number(w.amplitude)} * cos(phase) * gradient;
    `,
      )
      .join("\n")}
    return field;
  }
  vec3 oceanField(vec2 p, float t) {
    return oceanSurface(p, t).xyz;
  }
`;

export function createOcean(scene, sun, normals, foam, renderer) {
  // A continuous stretched grid avoids seams between LOD rings. Resolution is
  // concentrated around the camera, while the outer vertices reach the horizon.
  const geometry = new THREE.PlaneGeometry(
    2,
    2,
    oceanQuality.segments,
    oceanQuality.segments,
  );
  const positions = geometry.attributes.position;
  const stretch = (v) =>
    Math.sign(v) * (90 * Math.abs(v) + 3910 * Math.pow(Math.abs(v), 4));
  for (let i = 0; i < positions.count; i++) {
    positions.setXY(i, stretch(positions.getX(i)), stretch(positions.getY(i)));
  }
  positions.needsUpdate = true;

  const water = new Water(geometry, {
    textureWidth: oceanQuality.reflectionSize,
    textureHeight: oceanQuality.reflectionSize,
    waterNormals: normals,
    sunDirection: sun.clone().normalize(),
    sunColor: 0xffefd2,
    waterColor: 0x031c38,
    distortionScale: 1.5,
  });
  water.name = "OceanSurface";
  water.rotation.x = -Math.PI / 2;
  water.frustumCulled = false;
  const material = water.material;
  if (needsCompatibleLighting(renderer)) {
    // Water creates a half-float reflection target internally. Configure its
    // texture before the first upload so the iOS path uses RGBA8 throughout.
    material.uniforms.mirrorSampler.value.type = THREE.UnsignedByteType;
  }
  material.name = "WindRippleOcean";
  const surfaceFoam = createOceanFoam(
    renderer,
    normals,
    oceanWaveGLSL,
    oceanQuality.compact,
  );
  Object.assign(material.uniforms, surfaceFoam.uniforms);
  material.uniforms.foamSampler = { value: foam };
  material.uniforms.deepWaterColor = { value: new THREE.Color(0x083c80) };
  material.uniforms.horizonColor = { value: new THREE.Color(0x9dbcc8) };
  material.uniforms.daylight = { value: 1 };
  material.vertexShader = `
    uniform mat4 textureMatrix;
    uniform float time;
    varying vec4 mirrorCoord;
    varying vec3 vWorld;
    ${oceanWaveGLSL}
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      world.y += oceanField(world.xz, time).x;
      vWorld = world.xyz;
      // Reflection is projected onto the mean water plane.
      mirrorCoord = textureMatrix * vec4(world.x, 0.0, world.z, 1.0);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  material.fragmentShader = `
    uniform sampler2D mirrorSampler;
    uniform sampler2D normalSampler;
    uniform sampler2D foamSampler;
    uniform sampler2D surfaceFoamMap;
    uniform vec2 surfaceFoamOrigin;
    uniform vec2 surfaceFoamDrift;
    uniform float surfaceFoamSize;
    uniform float surfaceFoamAmount;
    uniform float surfaceFoamScale;
    uniform float surfaceFoamCrestHeight;
    uniform float time;
    uniform float daylight;
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform vec3 waterColor;
    uniform vec3 deepWaterColor;
    uniform vec3 horizonColor;
    uniform vec3 eye;
    varying vec4 mirrorCoord;
    varying vec3 vWorld;
    ${oceanWaveGLSL}
    ${foamPatternGLSL}
    void main() {
      vec4 surface = oceanSurface(vWorld.xz, time);
      vec3 field = surface.xyz;
      vec3 viewDir = normalize(eye - vWorld);
      float distanceToEye = length(eye - vWorld);
      vec2 uv = vWorld.xz;
      // Texture-driven advection replaces periodic sine distortion. Unrelated
      // scales, rotations and velocities hide tiling without adding new assets.
      mat2 rotateA = mat2(0.8, -0.6, 0.6, 0.8);
      mat2 rotateB = mat2(0.384615, 0.923077, -0.923077, 0.384615);
      mat2 rotateC = mat2(0.956305, -0.292372, 0.292372, 0.956305);
      vec2 current = texture2D(normalSampler, rotateB * uv * 0.0047
        + vec2(time * 0.0013, -time * 0.0017)).rg * 2.0 - 1.0;
      vec2 warp = current * 2.8;
      vec2 windStretch = vec2(1.45, 0.58);
      vec2 detailA = texture2D(normalSampler, (rotateA * (uv + warp)) * windStretch * 0.021
        + vec2(time * 0.0061, time * 0.0027)).rg * 2.0 - 1.0;
      vec2 detailB = texture2D(normalSampler, (rotateC * (uv - warp * 0.63)) * windStretch * 0.057
        + vec2(-time * 0.0083, time * 0.0049) + vec2(0.37, 0.61)).rg * 2.0 - 1.0;
      vec2 detailC = texture2D(normalSampler, rotateB * (uv + warp * 0.37) * 0.139
        + vec2(time * 0.011, -time * 0.007)).rg * 2.0 - 1.0;
      vec2 detailD = texture2D(normalSampler, rotateA * (uv - warp * 0.21) * 0.311
        + vec2(-time * 0.015, -time * 0.009) + vec2(0.71, 0.23)).rg * 2.0 - 1.0;
      // Fine ripples fade before they become subpixel, retaining broad wavelets
      // at the horizon. Swell no longer dominates the surface's lighting.
      float footprint = max(length(dFdx(uv)), length(dFdy(uv)));
      float fineFade = 1.0 - smoothstep(0.12, 0.8, footprint);
      float mediumFade = 1.0 - smoothstep(0.45, 2.5, footprint);
      vec2 ripple = transpose(rotateA) * (detailA * windStretch) * 0.95
        + transpose(rotateC) * (detailB * windStretch) * 0.60 * mediumFade
        + transpose(rotateB) * detailC * 0.22 * fineFade
        + transpose(rotateA) * detailD * 0.08 * fineFade;
      ripple *= 0.1;
      vec3 N = normalize(vec3(-field.y + ripple.x, 1.0, -field.z + ripple.y));
      float facing = clamp(dot(N, viewDir), 0.0, 1.0);
      float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
      vec2 distortion = N.xz * (0.009 + 0.32 / max(distanceToEye, 5.0));
      vec2 reflectionUV = clamp(mirrorCoord.xy / mirrorCoord.w + distortion, vec2(0.002), vec2(0.998));
      vec3 reflected = texture2D(mirrorSampler, reflectionUV).rgb;
      float sunUp = smoothstep(-0.04, 0.12, sunDirection.y);
      float diffuse = max(dot(N, sunDirection), 0.0);
      float crest = smoothstep(-0.15, 0.65, field.x);
      float backlight = pow(max(dot(viewDir, -sunDirection), 0.0), 3.0);
      // Longer sight lines absorb more light. Low-frequency current variation
      // gives the turquoise body subtle patches without screen-space bands.
      float opticalDepth = clamp(pow(1.0 - facing, 0.75) * 0.85
        + current.x * 0.18 + current.y * 0.12, 0.0, 1.0);
      vec3 body = mix(waterColor, deepWaterColor, opticalDepth);
      body *= (0.32 + 0.68 * diffuse) * daylight;
      body += vec3(0.009, 0.018, 0.020) * daylight;
      body += vec3(0.004, 0.028, 0.021) * crest * (0.3 + backlight) * sunUp;
      vec3 halfVector = normalize(viewDir + sunDirection);
      float specularAngle = max(dot(N, halfVector), 0.0);
      float glint = pow(specularAngle, mix(90.0, 240.0, fineFade));
      float broadGlint = pow(specularAngle, 38.0);
      vec3 color = mix(body, reflected, fresnel);
      color += sunColor * (glint * 0.95 * fineFade + broadGlint * 0.12) * sunUp;
      vec2 foamUV = uv - surfaceFoamDrift * time + current * 1.4;
      vec2 foam = foamPattern(foamSampler, rotateB * foamUV * surfaceFoamScale, time);
      float cells = smoothstep(0.04, 0.55, foam.x) * mix(0.5, 1.2, foam.y);
      cells = mix(0.5, cells, mediumFade);
      vec2 historyUV = (uv - surfaceFoamOrigin) / surfaceFoamSize + 0.5;
      float mapEdge = 1.0 - smoothstep(0.40, 0.49,
        max(abs(historyUV.x - 0.5), abs(historyUV.y - 0.5)));
      float history = texture2D(surfaceFoamMap, clamp(historyUV, 0.001, 0.999)).r;
      // Sparse distant caps bridge the finite history field to the horizon.
      float distantCaps = smoothstep(surfaceFoamCrestHeight, surfaceFoamCrestHeight + 0.28, field.x)
        * smoothstep(0.018, 0.085, surface.w) * smoothstep(0.12, 0.5, foam.x)
        * smoothstep(0.3, 0.7, foam.y) * 0.32;
      float density = mix(distantCaps, history, mapEdge);
      float foamCoverage = clamp(density * (0.28 + cells * 0.72) * surfaceFoamAmount, 0.0, 0.9);
      foamCoverage *= 1.0 - smoothstep(450.0, 1800.0, distanceToEye);
      vec3 foamColor = vec3(0.82, 0.90, 0.91) * daylight * (0.75 + diffuse * 0.25);
      color = mix(color, foamColor, foamCoverage);
      float haze = 1.0 - exp(-distanceToEye * 0.00048);
      color = mix(color, horizonColor, haze);
      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  water.userData.update = (time, camera) => {
    surfaceFoam.update(time, camera);
    material.uniforms.time.value = time;
    material.uniforms.sunDirection.value.copy(sun).normalize();
    const day = THREE.MathUtils.smoothstep(sun.y, -0.06, 0.35);
    material.uniforms.daylight.value = THREE.MathUtils.lerp(0.4, 1.0, day);
    material.uniforms.sunColor.value.set(day > 0.5 ? 0xffefd2 : 0xffaa68);
    material.uniforms.horizonColor.value.set(day > 0.5 ? 0x9dbcc8 : 0x706979);
    water.position.x = Math.round(camera.position.x / 4) * 4;
    water.position.z = Math.round(camera.position.z / 4) * 4;
  };
  material.addEventListener("dispose", () => surfaceFoam.dispose());
  scene.add(water);
  return water;
}
