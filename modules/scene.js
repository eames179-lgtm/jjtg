import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { oceanQuality } from "./ocean.js";
import { createModelMaterialAdapter, needsCompatibleLighting } from "./model-materials.js";
export { createOcean } from "./ocean.js";

export function createScene(canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    43,
    innerWidth / innerHeight,
    0.25,
    12000,
  );
  camera.position.set(54, 58, 64);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: devicePixelRatio <= 2,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, oceanQuality.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;

  const compatibleLighting = needsCompatibleLighting(renderer);
  scene.add(new THREE.HemisphereLight(
    0xc5e6ff, 0x233c43, compatibleLighting ? 1.6 : 1.15,
  ));
  const sunLight = new THREE.DirectionalLight(0xffefd9, 2.4);
  scene.add(sunLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 35;
  controls.maxDistance = 105;
  controls.minPolarAngle = 0.52;
  controls.maxPolarAngle = Math.PI / 2 - 0.12;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.75;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  controls.target.set(0, 0, -145);
  controls.update();

  const { sun, setSky } = buildSky(scene, renderer, compatibleLighting);
  sunLight.position.copy(sun);

  return {
    scene,
    camera,
    renderer,
    controls,
    prepareModel: createModelMaterialAdapter(compatibleLighting),
    clock: new THREE.Clock(false),
    sun,
    setSky(settings) {
      setSky(settings);
      sunLight.position.copy(sun);
      const daylight = THREE.MathUtils.smoothstep(sun.y, -0.06, 0.35);
      sunLight.intensity = THREE.MathUtils.lerp(0.65, 2.4, daylight);
      sunLight.color.set(daylight > 0.5 ? 0xffefd9 : 0xffab72);
    },
  };
}

function buildSky(scene, renderer, compatibleLighting) {
  const sun = new THREE.Vector3();
  const sky = new Sky();
  sky.scale.setScalar(10000);
  // Keep the physical sky within the exposure used by the ship and sea.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    "gl_FragColor.rgb *= 0.22;\n#include <tonemapping_fragment>",
  );
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 3.5;
  skyUniforms.rayleigh.value = 1.6;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;

  // iOS uses direct/hemisphere lighting and Phong model materials. Skip the
  // half-float environment render targets entirely, including at sunset.
  const pmremGenerator = compatibleLighting ? null : new THREE.PMREMGenerator(renderer);
  let environmentRenderTarget;

  function setSky({ elevation, azimuth, environmentIntensity }) {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms.sunPosition.value.copy(sun);
    scene.environmentIntensity = environmentIntensity;
    if (pmremGenerator) {
      // The directional light supplies the sun. Exclude the extremely bright
      // disc from the environment convolution to keep HDR samples bounded.
      const showSunDisc = skyUniforms.showSunDisc.value;
      skyUniforms.showSunDisc.value = false;
      let nextEnvironmentRenderTarget;
      try {
        nextEnvironmentRenderTarget = pmremGenerator.fromScene(sky);
      } finally {
        skyUniforms.showSunDisc.value = showSunDisc;
      }
      scene.environment = nextEnvironmentRenderTarget.texture;
      environmentRenderTarget?.dispose();
      environmentRenderTarget = nextEnvironmentRenderTarget;
    }
  }

  setSky({ elevation: 24, azimuth: 125, environmentIntensity: 0.85 });

  return { sun, setSky };
}

export function resizeScene(camera, renderer) {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, oceanQuality.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
}
