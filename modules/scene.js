import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";

export function createScene(canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    43,
    innerWidth / innerHeight,
    0.25,
    1000,
  );
  camera.position.set(54, 58, 64);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: devicePixelRatio <= 2,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.13;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
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

  const sun = buildSky(scene, renderer);
  sunLight.position.copy(sun);
  addSkyDetails(scene);

  return {
    scene,
    camera,
    renderer,
    controls,
    clock: new THREE.Clock(false),
    sun,
  };
}

function buildSky(scene, renderer) {
  const sun = new THREE.Vector3();
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 10;
  skyUniforms.rayleigh.value = 1;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;

  const elevation = 60;
  const azimuth = 50;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  sky.material.uniforms.sunPosition.value.copy(sun);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(sky).texture;
  scene.environmentIntensity = 0.5;

  return sun;
}

function addSkyDetails(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 80; i++) {
    positions.push(
      (Math.random() - 0.5) * 900,
      65 + Math.random() * 170,
      (Math.random() - 0.5) * 900,
    );
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xf5f5dc,
      size: 1.15,
      transparent: true,
      opacity: 0.38,
      sizeAttenuation: true,
    }),
  );
  scene.add(points);
}

export function createOcean(scene, sun, normals) {
  const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: sun.clone().normalize(),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  scene.add(water);
  return water;
}

export function resizeScene(camera, renderer) {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
}
