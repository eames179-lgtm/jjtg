import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";

const $ = (selector) => document.querySelector(selector);
const dom = {
  canvas: $("#scene"),
  loading: $("#loading-screen"),
  loadingStatus: $("#loading-status"),
  loadingFill: $("#loading-fill"),
  loadingTrack: $(".loading-track"),
  loadingActions: $("#loading-actions"),
  languagePrompt: $("#language-prompt"),
  hud: $("#hud"),
  languageToggle: $("#language-toggle"),
  missionLabel: $("#mission-label"),
  anchorProgress: $("#anchor-progress"),
  anchorImages: [...document.querySelectorAll("#anchor-progress img")],
  statusChip: $("#status-chip"),
  statusText: $("#status-text"),
  helm: $("#helm"),
  sailButton: $("#sail-button"),
  sailLabel: $("#sail-label"),
  helmHint: $("#helm-hint"),
  dangerWarning: $("#danger-warning"),
  dangerCode: $("#danger-code"),
  dangerText: $("#danger-text"),
  emergencyButton: $("#emergency-button"),
  emergencyLabel: $("#emergency-label"),
  popupBackdrop: $("#popup-backdrop"),
  popupPanel: $("#popup-panel"),
  popupDragHandle: $("#popup-drag-handle"),
  popupKicker: $("#popup-kicker"),
  popupTitle: $("#popup-title"),
  popupIndex: $("#popup-index"),
  popupContent: $("#popup-content"),
  popupBody: $("#popup-body"),
  popupClose: $("#popup-close"),
  compassNeedle: $("#compass-needle"),
};

const copy = {
  ko: {
    loading: (n) => `항해를 준비하는 중 · ${n}%`,
    ready: "항해 준비 완료",
    waiting: "선택한 언어로 탐사를 준비합니다",
    prompt: "언어를 선택하세요",
    mission: "해양 연구 항해",
    idle: "항해 대기",
    sailing: "항해 중",
    stopped: "정박 중",
    sail: "항해",
    stop: "정박",
    start: "항해 시작", // 💡 추가
    close: "닫기",
    dangerCode: "접근 경보 · 위험 단계",
    danger: "대함 미사일이 접근하고 있습니다.",
    emergency: "요격 미사일 발사",
    popupKicker: "AI 시험용으로 제작한 샘플 파일입니다.",
    titles: [
      "첫 만남",
      "신의 방패, 이지스",
      "비상사태",
      "세계최강 KVLS",
      "유령 사냥",
    ],
    completeKicker: "끝",
    completeTitle: "임무 완료",
  },
  en: {
    loading: (n) => `LOADING EXPEDITION DATA · ${n}%`,
    ready: "READY · SELECT A LANGUAGE",
    waiting: "Preparing the expedition in your language",
    prompt: "Choose a language to begin",
    mission: "OCEAN RESEARCH VOYAGE",
    idle: "READY TO SAIL",
    sailing: "UNDERWAY",
    stopped: "VESSEL STOPPED",
    sail: "SAIL",
    stop: "STOP",
    start: "START VOYAGE", // 💡 추가
    hint: "Drag the helm to steer",
    close: "CLOSE",
    dangerCode: "PROXIMITY ALERT · CRITICAL",
    danger: "A radioactive missile is approaching.",
    emergency: "LAUNCH ANTI-AIR MISSILE",
    popupKicker: "OCEAN RESEARCH FIELD LOG",
    titles: [
      "Current Boundary",
      "Thermal Convergence",
      "Threat Neutralized",
      "Deep-sea Signal",
      "Bioluminescent Sample",
    ],
    completeKicker: "EXPEDITION COMPLETE",
    completeTitle: "RESEARCH 100% COMPLETE",
  },
};

const state = {
  language: null,
  assetsReady: false,
  startRequested: false, // 💡 추가 (시작 버튼을 눌렀는지 여부)
  gameStarted: false,
  sailing: false,
  popupOpen: false,
  alarmActive: false,
  itemCount: 0,
  elapsed: 0,
  completionShown: false,
  completionPending: false,
  collected: new Set(),
  openedTriggerPopups: new Set(),
  handledTriggers: new Set(),
  triggerInside: new Set(),
  currentSpeed: 0,
};

let scene, camera, renderer, controls, water, player, playerBox, wake;
let mapAnchor;
let mapStart,
  mapSceneReady = false,
  playerStartInitialized = false;
let playerBaseY = -2.5;
let clock, alarmAudio, bgmAudio, popupAudio, sun;
const audioFades = new WeakMap();
const AUDIO_LEVELS = {
  bgm: 0.34,
  bgmDucked: 0.045,
  alarm: 0.82,
  popup: 0.83,
};
const AUDIO_UNLOCK_EVENTS = ["pointerdown", "keydown"];
const triggers = new Map();
const colliders = []; // 충돌 콜라이더 배열
const pickupParticles = [];
const playerForward = new THREE.Vector3();
const previousPlayerPosition = new THREE.Vector3();
const cameraFollowDelta = new THREE.Vector3();
const idealCameraPos = new THREE.Vector3();
const idealTargetPos = new THREE.Vector3();
const mapAnchorTriggerOffset = new THREE.Vector3();
const mapAnchorWorldPosition = new THREE.Vector3();
const mapAnchorTargetPosition = new THREE.Vector3();
const ANCHOR_ROTATION_SPEED = (8 * Math.PI * 2) / 60;

// Flat-water wake: one small dynamic ribbon + one procedural shader draw call.
// These are the main art-direction controls if the model scale changes.
const WAKE = {
  maxSections: 120,
  sampleSpacing: 1.65,
  lifetime: 3.5,
  surfaceY: 0.12,
  maxHalfWidth: 12.5,
};
const wakeSamples = [];
const wakeStern = new THREE.Vector3();
const wakeRight = new THREE.Vector3();
const wakeSize = new THREE.Vector3();
let wakeSternOffset = 7.0;
let wakeBaseHalfWidth = 2.8;

const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (_url, loaded, total) =>
  setLoadingProgress(Math.round((loaded / Math.max(total, 1)) * 100));
loadingManager.onLoad = () => {
  state.assetsReady = true;
  setLoadingProgress(100);
  dom.loading.classList.add("is-ready");
  dom.loadingActions.inert = false;
  dom.loadingActions.setAttribute("aria-hidden", "false");
  dom.loadingStatus.textContent = state.language
    ? copy[state.language].waiting
    : copy.ko.ready;
  startBackgroundMusic();
  tryStartGame();
};
loadingManager.onError = (url) => console.error(`Could not load asset: ${url}`);

function setLoadingProgress(value) {
  dom.loadingFill.style.width = `${value}%`;
  dom.loadingTrack.setAttribute("aria-valuenow", value);
  if (!state.assetsReady)
    dom.loadingStatus.textContent = copy[state.language || "ko"].loading(value);
}

bindBackgroundMusicUnlock();
startBackgroundMusic();
initScene();
bindUI();
loadAssets();

function initScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    43,
    innerWidth / innerHeight,
    0.25,
    1000,
  );
  camera.position.set(54, 58, 64);

  renderer = new THREE.WebGLRenderer({
    canvas: dom.canvas,
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

  controls = new OrbitControls(camera, renderer.domElement);
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

  clock = new THREE.Clock(false);

  buildSky();
  sunLight.position.copy(sun);

  addSkyDetails();
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.sailing) setSailing(false);
  });
}

function buildSky() {
  sun = new THREE.Vector3();
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms["turbidity"].value = 10;
  skyUniforms["rayleigh"].value = 1;
  skyUniforms["mieCoefficient"].value = 0.005;
  skyUniforms["mieDirectionalG"].value = 0.8;

  const parameters = {
    elevation: 60,
    azimuth: 50,
  };

  const pmremGenerator = new THREE.PMREMGenerator(renderer);

  const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
  const theta = THREE.MathUtils.degToRad(parameters.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  sky.material.uniforms["sunPosition"].value.copy(sun);
  scene.environment = pmremGenerator.fromScene(sky).texture;
  scene.environmentIntensity = 0.5;
}

function addSkyDetails() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 80; i++)
    positions.push(
      (Math.random() - 0.5) * 900,
      65 + Math.random() * 170,
      (Math.random() - 0.5) * 900,
    );
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

function loadAssets() {
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const normals = textureLoader.load("./waternormals.jpg", (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });
  const wakeFoam = textureLoader.load("./wake_foam.png", (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
  });

  water = new Water(new THREE.PlaneGeometry(10000, 10000), {
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
  createWake(wakeFoam);

  const loader = new GLTFLoader(loadingManager);
  loader.load("./map.glb", ({ scene: mapScene }) => {
    scene.add(mapScene);
    mapScene.updateMatrixWorld(true);
    mapScene.traverse((object) => {
      if (!object.name) return;

      if (object.name.toLowerCase() === "anchor") mapAnchor = object;
      if (object.name.toLowerCase() === "start") mapStart = object;

      if (object.isMesh && object.name.toLowerCase().includes("collider")) {
        object.visible = false;
        colliders.push(object);
        return;
      }

      const match = object.name.match(/^trigger([1-5])$/i);
      if (!match) return;
      const index = Number(match[1]);

      object.visible = false;
      triggers.set(index, {
        object,
        box: new THREE.Box3().setFromObject(object),
      });
    });
    const firstTrigger = triggers.get(1);
    if (mapAnchor && firstTrigger) {
      mapAnchor.getWorldPosition(mapAnchorWorldPosition);
      firstTrigger.box.getCenter(mapAnchorTargetPosition);
      mapAnchorTriggerOffset.subVectors(
        mapAnchorWorldPosition,
        mapAnchorTargetPosition,
      );
    }
    if (!mapAnchor) console.warn('map.glb is missing an "anchor" object.');
    if (!mapStart) console.warn('map.glb is missing a "start" object.');

    mapSceneReady = true;
    initializePlayerStart();
  });

  loader.load("./player.glb", ({ scene: playerScene }) => {
    player = new THREE.Group();
    player.name = "Player";
    player.add(playerScene);
    playerScene.scale.setScalar(0.44);
    player.traverse((object) => {
      if (object.isMesh) {
        object.frustumCulled = true;
        object.material.envMapIntensity = 0.55;
      }
    });
    scene.add(player);
    player.updateMatrixWorld(true);
    const modelBounds = new THREE.Box3().setFromObject(playerScene);
    const center = modelBounds.getCenter(new THREE.Vector3());
    modelBounds.getSize(wakeSize);
    wakeSternOffset = THREE.MathUtils.clamp(wakeSize.z * 0.43, 5.0, 14.0);
    wakeBaseHalfWidth = THREE.MathUtils.clamp(wakeSize.x * 0.34, 2.2, 5.2);
    playerScene.position.x -= center.x;
    playerScene.position.z -= center.z;
    playerScene.position.y -= modelBounds.min.y;
    playerBox = new THREE.Box3();
    initializePlayerStart();
  });
}

function initializePlayerStart() {
  if (!player || !mapSceneReady || playerStartInitialized) return;

  if (mapStart) {
    mapStart.getWorldPosition(player.position);
    playerBaseY = player.position.y;
  } else {
    // Keep the previous starting point as a safe fallback for older map files.
    player.position.set(48, -2.5, -180);
    playerBaseY = player.position.y;
  }

  player.rotation.set(0, -1.78, 0);

  player.updateMatrixWorld(true);
  previousPlayerPosition.copy(player.position);

  const cameraOffset = new THREE.Vector3(0, 53, -77).applyQuaternion(
    player.quaternion,
  );
  camera.position.copy(player.position).add(cameraOffset);
  controls.target.copy(player.position).add(new THREE.Vector3(0, 3, 0));
  controls.update();
  playerStartInitialized = true;
}

function createWake(foamTexture) {
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
      uFoamColor: { value: new THREE.Color(0xc9f4ec) },
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

        // Two world-space samples prevent the repeated texture from sliding
        // like a single sheet and break up both the centre and outer edge.
        vec2 uvA = vWorldXZ * 0.07 + vec2(uTime * 0.1, -uTime * 0.018);
        mat2 rotateUV = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 uvB = rotateUV * vWorldXZ * 0.24
                 + vec2(-uTime * 0.021, uTime * 0.014);
        float foamA = texture2D(uFoamTexture, uvA).r;
        float foamB = texture2D(uFoamTexture, uvB).r;
        float foamTexture = smoothstep(0.05, 0.4, foamA * (0.58 + foamB));
        float edgeNoise = mix(foamA, foamB, 0.5);
        float edgeStart = mix(0.40, 0.62, edgeNoise);

        // wake 바깥쪽을 넓게 투명 처리
        float fadeSides = 1.0 - smoothstep(edgeStart, 1.0, lateral);
        fadeSides = pow(fadeSides, 1.25);

        // Broken foam in the prop wash, plus the two diverging shoulder waves.
        float centre = 1.0 - smoothstep(0.04, 0.64, lateral);
        float railPosition = mix(0.58, 0.78, smoothstep(0.0, 0.7, vAge));
        float rails = 1.0 - smoothstep(0.035, 0.14, abs(lateral - railPosition));
        float sternBurst = (1.0 - smoothstep(0.0, 0.20, vAge))
                         * (1.0 - smoothstep(0.68, 0.98, lateral));

        float shape = centre * 0.48 + rails * 0.72 + sternBurst * 0.30;
        float alpha = clamp(
          shape * foamTexture * fadeTail * fadeSides * vStrength * 1.5,
          0.0,
          0.74
        );
        if (alpha < 0.025) discard;

        vec3 color = mix(uFoamColor * 0.70, vec3(0.96, 1.0, 0.98), foamA);
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

function updateWake() {
  if (!wake || !player) return;

  const speedRatio = THREE.MathUtils.clamp(state.currentSpeed / 26, 0, 1);
  playerForward
    .set(0, 0, 1)
    .applyQuaternion(player.quaternion)
    .setY(0)
    .normalize();
  wakeStern
    .copy(player.position)
    .addScaledVector(playerForward, wakeSternOffset * 0.15)
    .setY(WAKE.surfaceY);

  const newest = wakeSamples[wakeSamples.length - 1];
  if (
    speedRatio > 0.035 &&
    (!newest || newest.position.distanceTo(wakeStern) >= WAKE.sampleSpacing)
  ) {
    wakeSamples.push({
      position: wakeStern.clone(),
      forward: playerForward.clone(),
      time: state.elapsed,
      strength: THREE.MathUtils.smoothstep(speedRatio, 0.02, 0.72),
    });
    if (wakeSamples.length > WAKE.maxSections) wakeSamples.shift();
  }

  while (
    wakeSamples.length &&
    state.elapsed - wakeSamples[0].time > WAKE.lifetime
  ) {
    wakeSamples.shift();
  }

  const geometry = wake.geometry;
  const position = geometry.attributes.position;
  const age = geometry.attributes.aAge;
  const strength = geometry.attributes.aStrength;

  for (let i = 0; i < wakeSamples.length; i++) {
    const sample = wakeSamples[i];
    const normalizedAge = THREE.MathUtils.clamp(
      (state.elapsed - sample.time) / WAKE.lifetime,
      0,
      1,
    );
    const halfWidth = THREE.MathUtils.lerp(
      wakeBaseHalfWidth,
      WAKE.maxHalfWidth,
      Math.pow(normalizedAge, 0.68),
    );
    wakeRight.set(sample.forward.z, 0, -sample.forward.x);

    position.setXYZ(
      i * 2,
      sample.position.x - wakeRight.x * halfWidth,
      WAKE.surfaceY,
      sample.position.z - wakeRight.z * halfWidth,
    );
    position.setXYZ(
      i * 2 + 1,
      sample.position.x + wakeRight.x * halfWidth,
      WAKE.surfaceY,
      sample.position.z + wakeRight.z * halfWidth,
    );
    age.setX(i * 2, normalizedAge);
    age.setX(i * 2 + 1, normalizedAge);
    strength.setX(i * 2, sample.strength);
    strength.setX(i * 2 + 1, sample.strength);
  }

  position.needsUpdate = true;
  age.needsUpdate = true;
  strength.needsUpdate = true;
  geometry.setDrawRange(0, Math.max(0, wakeSamples.length - 1) * 6);
  wake.material.uniforms.uTime.value = state.elapsed;
}

function bindUI() {
  document
    .querySelectorAll(".language-button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectLanguage(button.dataset.language),
      ),
    );
  const startBtn = document.getElementById("start-voyage-button");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startBackgroundMusic();
      state.startRequested = true; // 시작 버튼을 눌렀다고 표시
      tryStartGame(); // 게임 시작 시도
    });
  }

  dom.languageToggle.addEventListener("click", () =>
    selectLanguage(state.language === "ko" ? "en" : "ko"),
  );
  dom.popupClose.addEventListener("click", closePopup);
  bindPopupDrag();
  dom.emergencyButton.addEventListener("click", neutralizeThreat);
  bindHelm();
  bindLoadingHelm();
}

function bindPopupDrag() {
  let pointerId = null;
  let startY = 0;
  let dragY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;

  const finishDrag = (event, cancelled = false) => {
    if (event.pointerId !== pointerId) return;

    if (dom.popupDragHandle.hasPointerCapture(pointerId)) {
      dom.popupDragHandle.releasePointerCapture(pointerId);
    }
    pointerId = null;
    dom.popupBackdrop.classList.remove("is-dragging");

    const dismissDistance = Math.min(160, dom.popupPanel.clientHeight * 0.24);
    const shouldDismiss =
      !cancelled &&
      (dragY >= dismissDistance || (dragY >= 60 && velocity >= 0.65));

    if (shouldDismiss) {
      closePopup();
      return;
    }

    dom.popupBackdrop.classList.add("is-settling");
    dom.popupPanel.style.setProperty("--popup-drag-y", "0px");
    window.setTimeout(() => {
      dom.popupBackdrop.classList.remove("is-settling");
      dom.popupPanel.style.removeProperty("--popup-drag-y");
    }, 250);
  };

  dom.popupDragHandle.addEventListener("pointerdown", (event) => {
    if (!state.popupOpen || !event.isPrimary || event.button !== 0) return;
    pointerId = event.pointerId;
    startY = event.clientY;
    dragY = 0;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    dom.popupPanel.style.setProperty("--popup-drag-y", "0px");
    dom.popupBackdrop.classList.remove("is-settling");
    dom.popupBackdrop.classList.add("is-dragging");
    dom.popupDragHandle.setPointerCapture(pointerId);
  });

  dom.popupDragHandle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    dragY = Math.max(0, event.clientY - startY);
    const elapsed = Math.max(1, event.timeStamp - lastTime);
    velocity = (event.clientY - lastY) / elapsed;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    dom.popupPanel.style.setProperty("--popup-drag-y", `${dragY}px`);
  });

  dom.popupDragHandle.addEventListener("pointerup", (event) =>
    finishDrag(event),
  );
  dom.popupDragHandle.addEventListener("pointercancel", (event) =>
    finishDrag(event, true),
  );
}

function selectLanguage(language) {
  startBackgroundMusic();
  state.language = language;
  document.documentElement.lang = language;
  primeAlarmAudio();
  applyLanguage();
  // 💡 추가: 선택한 언어 버튼에 색상 칠하기 (시각적 피드백)
  document.querySelectorAll(".language-button").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.language === language);
  });

  // 💡 추가: 시작 버튼 잠금 해제 및 텍스트 변경
  const startBtn = document.getElementById("start-voyage-button");
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = copy[language].start;
  }
}

function ensureAudio() {
  if (!bgmAudio) {
    bgmAudio = new Audio("./bgm.mp3");
    bgmAudio.loop = true;
    bgmAudio.preload = "auto";
    bgmAudio.volume = 0;
  }
  if (!alarmAudio) {
    alarmAudio = new Audio("./alarm.mp3");
    alarmAudio.loop = true;
    alarmAudio.preload = "auto";
    alarmAudio.volume = 0;
  }
  if (!popupAudio) {
    popupAudio = new Audio("./popupsound.mp3");
    popupAudio.preload = "auto";
    popupAudio.volume = AUDIO_LEVELS.popup;
  }
}

function bindBackgroundMusicUnlock() {
  AUDIO_UNLOCK_EVENTS.forEach((eventName) =>
    window.addEventListener(eventName, startBackgroundMusic, {
      capture: true,
      passive: true,
    }),
  );
}

function unbindBackgroundMusicUnlock() {
  AUDIO_UNLOCK_EVENTS.forEach((eventName) =>
    window.removeEventListener(eventName, startBackgroundMusic, true),
  );
}

function fadeAudio(audio, targetVolume, duration, onComplete) {
  if (!audio) return;
  const previousFade = audioFades.get(audio);
  if (previousFade) cancelAnimationFrame(previousFade);

  const fromVolume = audio.volume;
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - startedAt) / Math.max(duration, 1), 1);
    const eased = progress * progress * (3 - 2 * progress);
    audio.volume = THREE.MathUtils.clamp(
      fromVolume + (targetVolume - fromVolume) * eased,
      0,
      1,
    );

    if (progress < 1) {
      audioFades.set(audio, requestAnimationFrame(tick));
      return;
    }
    audioFades.delete(audio);
    onComplete?.();
  };

  audioFades.set(audio, requestAnimationFrame(tick));
}

function startBackgroundMusic() {
  ensureAudio();

  const target = state.alarmActive ? AUDIO_LEVELS.bgmDucked : AUDIO_LEVELS.bgm;
  const fadeDuration = state.alarmActive ? 650 : 2800;
  const beginFade = () => fadeAudio(bgmAudio, target, fadeDuration);

  if (!bgmAudio.paused) {
    unbindBackgroundMusicUnlock();
    beginFade();
    return;
  }

  const attempt = bgmAudio.play();
  if (attempt) {
    attempt
      .then(() => {
        unbindBackgroundMusicUnlock();
        beginFade();
      })
      .catch(() => {
        // 브라우저가 자동 재생을 막으면 첫 사용자 입력에서 다시 시도합니다.
      });
  }
}

function primeAlarmAudio() {
  ensureAudio();
  if (!alarmAudio.paused || state.alarmActive) return;
  alarmAudio.muted = true;
  const attempt = alarmAudio.play();
  if (attempt)
    attempt
      .then(() => {
        if (state.alarmActive) return;
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        alarmAudio.muted = false;
      })
      .catch(() => {
        alarmAudio.muted = false;
      });
}

function applyLanguage() {
  const t = copy[state.language];
  dom.languagePrompt.textContent = t.prompt;
  dom.popupClose.textContent = t.close;
  dom.dangerCode.textContent = t.dangerCode;
  dom.dangerText.textContent = t.danger;
  dom.emergencyLabel.textContent = t.emergency;
  dom.languageToggle.textContent = state.language === "ko" ? "EN" : "KR";
  updateSailingUI();
  if (!state.assetsReady)
    dom.loadingStatus.textContent = t.loading(
      Number(dom.loadingTrack.getAttribute("aria-valuenow")) || 0,
    );
  else if (!state.gameStarted) dom.loadingStatus.textContent = t.waiting;
  if (state.popupOpen) applyTemplateLanguage(dom.popupBody);
}

function tryStartGame() {
  if (
    !state.assetsReady ||
    !state.language ||
    !state.startRequested || // 💡 추가: 시작 버튼을 눌러야만 통과
    state.gameStarted ||
    !player ||
    !triggers.size
  )
    return;
  state.gameStarted = true;
  dom.hud.classList.remove("is-hidden");
  dom.hud.setAttribute("aria-hidden", "false");
  dom.loading.inert = true;
  dom.loading.setAttribute("aria-hidden", "true");
  dom.loading.classList.add("is-complete");
  dom.loading.addEventListener(
    "transitionend",
    () => dom.loading.classList.add("is-hidden"),
    { once: true },
  );
  clock.start();
  renderer.setAnimationLoop(animate);
}

function bindHelm() {
  const HELM_TO_PLAYER_RATIO = 25;
  const TAP_MOVE_THRESHOLD = 8;
  let dragging = false;
  let activePointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let movedBeyondTapThreshold = false;
  let lastPointerAngle = 0;
  let displayedWheelAngle = 0;
  let snapAnimationId = null;
  let helmVelocity = 0;

  const pointerAngle = (event) => {
    const rect = dom.helm.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      ) *
        180) /
      Math.PI
    );
  };
  const normalizedDelta = (a, b) => ((a - b + 540) % 360) - 180;

  const stopSnapAnimation = () => {
    if (snapAnimationId) {
      cancelAnimationFrame(snapAnimationId);
      snapAnimationId = null;
    }
  };

  dom.helm.addEventListener("pointerdown", (event) => {
    if (
      state.popupOpen ||
      state.alarmActive ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    dragging = true;
    activePointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    movedBeyondTapThreshold = false;
    lastPointerAngle = pointerAngle(event);
    helmVelocity = 0;
    stopSnapAnimation();
    dom.helm.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  dom.helm.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointerId || !player) return;

    const currentAngle = pointerAngle(event);
    const incremental = normalizedDelta(currentAngle, lastPointerAngle);
    lastPointerAngle = currentAngle;

    if (!movedBeyondTapThreshold) {
      movedBeyondTapThreshold =
        Math.hypot(
          event.clientX - pointerStartX,
          event.clientY - pointerStartY,
        ) >= TAP_MOVE_THRESHOLD;
      if (!movedBeyondTapThreshold) return;
    }

    displayedWheelAngle += incremental;
    player.rotation.y -= THREE.MathUtils.degToRad(
      incremental / HELM_TO_PLAYER_RATIO,
    );
    dom.helm.style.setProperty("--helm-angle", `${displayedWheelAngle}deg`);
    event.preventDefault();
  });

  const endDrag = (event, cancelled = false) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    if (dom.helm.hasPointerCapture(event.pointerId))
      dom.helm.releasePointerCapture(event.pointerId);

    if (!cancelled && !movedBeyondTapThreshold) {
      setSailing(!state.sailing);
    }

    let lastTime = performance.now();
    const snapBack = (time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.04);
      lastTime = time;

      const tension = 150;
      const friction = 12;
      const force = -displayedWheelAngle * tension;

      helmVelocity += (force - helmVelocity * friction) * dt;
      displayedWheelAngle += helmVelocity * dt;
      dom.helm.style.setProperty("--helm-angle", `${displayedWheelAngle}deg`);

      if (Math.abs(displayedWheelAngle) < 0.1 && Math.abs(helmVelocity) < 0.1) {
        displayedWheelAngle = 0;
        helmVelocity = 0;
        dom.helm.style.setProperty("--helm-angle", `0deg`);
        snapAnimationId = null;
      } else {
        snapAnimationId = requestAnimationFrame(snapBack);
      }
    };
    snapAnimationId = requestAnimationFrame(snapBack);
  };

  dom.helm.addEventListener("pointerup", endDrag);
  dom.helm.addEventListener("pointercancel", (event) => endDrag(event, true));
  dom.helm.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSailing(!state.sailing);
  });
}

function setSailing(value) {
  state.sailing = Boolean(value) && !state.popupOpen && !state.alarmActive;
  controls.enableRotate = !state.sailing;
  updateSailingUI();
}

function updateSailingUI() {
  if (!state.language) return;
  const t = copy[state.language];
  dom.helm.classList.toggle("is-sailing", state.sailing);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  state.elapsed += dt;
  if (!player) return;

  if (mapAnchor?.visible) mapAnchor.rotateY(ANCHOR_ROTATION_SPEED * dt);

  previousPlayerPosition.copy(player.position);

  const targetSpeed = state.sailing ? 26 : 0;
  state.currentSpeed = THREE.MathUtils.lerp(
    state.currentSpeed,
    targetSpeed,
    dt * 2.0,
  );

  if (state.currentSpeed > 0.05) {
    playerForward
      .set(0, 0, 1)
      .applyQuaternion(player.quaternion)
      .setY(0)
      .normalize();

    const moveVelocity = playerForward
      .clone()
      .multiplyScalar(state.currentSpeed * dt);

    const rayOrigin = player.position.clone();
    rayOrigin.y += 1.0;
    const collisionRadius = 4.0;

    const raycaster = new THREE.Raycaster(
      rayOrigin,
      playerForward,
      0,
      moveVelocity.length() + collisionRadius,
    );

    const intersects = raycaster.intersectObjects(colliders, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.face) {
        const normal = hit.face.normal.clone();
        normal.transformDirection(hit.object.matrixWorld).normalize();
        moveVelocity.projectOnPlane(normal);
      }
    }

    player.position.add(moveVelocity);
  }

  if (state.sailing) {
    player.position.y = playerBaseY + Math.sin(state.elapsed * 1.9) * 0.14;
    player.rotation.z = Math.sin(state.elapsed * 1.45) * 0.015;
  } else {
    player.position.y = playerBaseY + Math.sin(state.elapsed * 1.4) * 0.1;
    player.rotation.z *= 0.92;
  }

  updateFollowingCamera(dt);

  controls.update();
  water.material.uniforms.time.value += dt * 0.55;
  updateWake();
  updatePickupParticles(dt);
  checkTriggers();
  renderer.render(scene, camera);

  updateCompass();

  controls.update();
  water.material.uniforms.time.value += dt * 0.55;
}

function updateCompass() {
  if (!dom.compassNeedle || triggers.size === 0) return;

  // 현재 확보한 표본 갯수 + 1을 목표 인덱스로 잡습니다.
  const targetIndex = state.itemCount + 1;

  // 표본 5개를 모두 모았다면 나침반을 서서히 숨깁니다.
  if (targetIndex > 5) {
    dom.compassNeedle.style.opacity = "0";
    return;
  }

  // 아이템(item) 대신 이벤트 판정 구역인 트리거(trigger)를 가져옵니다.
  const targetTrigger = triggers.get(targetIndex);
  if (!targetTrigger) return;

  // 트리거 충돌 박스의 정확한 정중앙 좌표(Center)를 계산합니다.
  const targetCenter = new THREE.Vector3();
  targetTrigger.box.getCenter(targetCenter);

  // 플레이어와 트리거 중앙점 간의 2D 방향 벡터 (Y축 무시)
  const dx = targetCenter.x - player.position.x;
  const dz = targetCenter.z - player.position.z;

  // 월드 공간 상의 절대 각도 (라디안)
  const absoluteAngle = Math.atan2(dx, dz);

  // 플레이어의 현재 회전값(Y축)을 빼서 로컬 상대 각도로 변환
  const relativeAngle = absoluteAngle - player.rotation.y;

  // 라디안을 일반 각도(도, Degree)로 변환
  const needleAngleDeg = relativeAngle * (180 / Math.PI);

  // CSS 변수에 실시간으로 값을 넘겨주어 화살표를 회전시킵니다.
  dom.compassNeedle.style.setProperty("--needle-angle", `${needleAngleDeg}deg`);
}

function updateFollowingCamera(dt) {
  if (state.sailing) {
    const cameraOffset = new THREE.Vector3(0, 35, -90);
    cameraOffset.applyQuaternion(player.quaternion);

    idealCameraPos.copy(player.position).add(cameraOffset);
    idealTargetPos.copy(player.position).add(new THREE.Vector3(0, 15, 0));

    camera.position.lerp(idealCameraPos, dt * 3.0);
    controls.target.lerp(idealTargetPos, dt * 4.0);
  } else {
    cameraFollowDelta.subVectors(player.position, previousPlayerPosition);
    camera.position.add(cameraFollowDelta);
    controls.target.add(cameraFollowDelta);
  }
}

function checkTriggers() {
  player.updateMatrixWorld(true);
  playerBox.setFromObject(player).expandByScalar(-0.4);
  triggers.forEach((trigger, index) => {
    const touching = playerBox.intersectsBox(trigger.box);
    if (touching && !state.triggerInside.has(index)) onTriggerEnter(index);
    if (touching) state.triggerInside.add(index);
    else state.triggerInside.delete(index);
  });
}

function onTriggerEnter(index) {
  if (index !== state.itemCount + 1) return;
  // 팝업 콘텐츠가 준비되지 않은 트리거는 진행 상태나 항해를 멈추지 않습니다.
  if (index !== 3 && !$(`#trigger-template-${index}`)) return;
  if (!state.collected.has(index)) collectItem(index);
  if (state.handledTriggers.has(index)) return;
  state.handledTriggers.add(index);
  if (index === 3) {
    setSailing(false);
    activateThreat();
  } else openPopup(index);
}

function collectItem(index) {
  state.collected.add(index);
  state.itemCount = state.collected.size;

  // triggers의 좌표를 가져와서 획득 파티클(폭죽)을 터뜨립니다.
  const triggerEntry = triggers.get(index);
  if (triggerEntry) {
    const pos = new THREE.Vector3();
    triggerEntry.box.getCenter(pos);
    createPickupBurst(pos);
  }

  if (state.itemCount === 5 && !state.completionShown) {
    state.completionShown = true;
    window.setTimeout(() => {
      if (state.popupOpen || state.alarmActive) state.completionPending = true;
      else openCompletionPopup();
    }, 1150);
  }
}

function easeInBack(x) {
  const c = 1.70158;
  return (c + 1) * x * x * x - c * x * x;
}

function createPickupBurst(position) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(18 * 3);
  const velocities = [];
  for (let i = 0; i < 18; i++) {
    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        2 + Math.random() * 7,
        (Math.random() - 0.5) * 8,
      ),
    );
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x86fff3,
    size: 1.2,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.position.copy(position);
  scene.add(points);
  pickupParticles.push({ points, velocities, life: 1 });
}

function updatePickupParticles(dt) {
  for (let p = pickupParticles.length - 1; p >= 0; p--) {
    const effect = pickupParticles[p];
    effect.life -= dt * 0.95;
    const positions = effect.points.geometry.attributes.position;
    effect.velocities.forEach((velocity, i) => {
      positions.array[i * 3] += velocity.x * dt;
      positions.array[i * 3 + 1] += velocity.y * dt;
      positions.array[i * 3 + 2] += velocity.z * dt;
      velocity.y -= 8 * dt;
    });
    positions.needsUpdate = true;
    effect.points.material.opacity = Math.max(effect.life, 0);
    if (effect.life <= 0) {
      scene.remove(effect.points);
      effect.points.geometry.dispose();
      effect.points.material.dispose();
      pickupParticles.splice(p, 1);
    }
  }
}

function playPopupSound() {
  ensureAudio();
  popupAudio.pause();
  popupAudio.currentTime = 0;
  popupAudio.play().catch(() => {
    /* Audio is an enhancement; gameplay remains functional if unavailable. */
  });
}

function activateThreat() {
  state.alarmActive = true;
  dom.hud.classList.add("is-threat-active");
  dom.dangerWarning.classList.remove("is-hidden");
  dom.emergencyButton.classList.remove("is-hidden");
  ensureAudio();
  fadeAudio(bgmAudio, AUDIO_LEVELS.bgmDucked, 650);
  alarmAudio.muted = false;
  alarmAudio.volume = 0;
  alarmAudio.currentTime = 0;
  const attempt = alarmAudio.play();
  if (attempt)
    attempt
      .then(() => fadeAudio(alarmAudio, AUDIO_LEVELS.alarm, 420))
      .catch(() => {});
}

function neutralizeThreat() {
  if (!state.alarmActive) return;
  state.alarmActive = false;
  dom.hud.classList.remove("is-threat-active");
  dom.dangerWarning.classList.add("is-hidden");
  dom.emergencyButton.classList.add("is-hidden");
  if (alarmAudio) {
    fadeAudio(alarmAudio, 0, 720, () => {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    });
  }
  startBackgroundMusic();
  openPopup(3);
}

function openPopup(index) {
  const template = $(`#trigger-template-${index}`);
  if (!template) return false;
  markTriggerPopupOpened(index);
  state.popupOpen = true;
  setSailing(false);
  dom.popupKicker.textContent = copy[state.language].popupKicker;
  dom.popupTitle.textContent = copy[state.language].titles[index - 1];
  dom.popupIndex.textContent = String(index).padStart(2, "0");
  dom.popupBody.replaceChildren(template.content.cloneNode(true));
  applyTemplateLanguage(dom.popupBody);
  showPopupDOM();
  advanceMapAnchor(index);
  return true;
}

function markTriggerPopupOpened(index) {
  if (state.openedTriggerPopups.has(index)) return;

  state.openedTriggerPopups.add(index);
  const acquiredCount = state.openedTriggerPopups.size;
  const anchorImage = dom.anchorImages[acquiredCount - 1];
  if (!anchorImage) return;

  anchorImage.src = "./anchor_get.png";
  anchorImage.alt = "확인한 연구 기록";
  anchorImage.classList.add("is-acquired");
  dom.anchorProgress.setAttribute(
    "aria-label",
    `확인한 연구 기록 ${acquiredCount}/5`,
  );
}

function advanceMapAnchor(currentTriggerIndex) {
  if (!mapAnchor) return;

  if (currentTriggerIndex >= 5) {
    mapAnchor.visible = false;
    return;
  }

  const nextTrigger = triggers.get(currentTriggerIndex + 1);
  if (!nextTrigger) return;

  nextTrigger.box
    .getCenter(mapAnchorTargetPosition)
    .add(mapAnchorTriggerOffset);
  mapAnchor.parent?.worldToLocal(mapAnchorTargetPosition);
  mapAnchor.position.copy(mapAnchorTargetPosition);
  mapAnchor.visible = true;
  mapAnchor.updateMatrixWorld(true);
}

function openCompletionPopup() {
  state.popupOpen = true;
  setSailing(false);
  dom.popupKicker.textContent = copy[state.language].completeKicker;
  dom.popupTitle.textContent = copy[state.language].completeTitle;
  dom.popupIndex.textContent = "✓";
  dom.popupBody.replaceChildren(
    $("#completion-template").content.cloneNode(true),
  );
  applyTemplateLanguage(dom.popupBody);
  showPopupDOM();
}

function showPopupDOM() {
  dom.popupPanel.style.removeProperty("--popup-drag-y");
  dom.popupBackdrop.classList.remove(
    "is-hidden",
    "is-closing",
    "is-dragging",
    "is-settling",
  );
  dom.popupBackdrop.setAttribute("aria-hidden", "false");
  dom.popupPanel.focus({ preventScroll: true });
  dom.popupContent.scrollTop = 0;
  dom.popupBackdrop.classList.add("is-open");
  playPopupSound();

  window.requestAnimationFrame(() => {
    dom.popupContent.scrollTop = 0;
    window.requestAnimationFrame(() => {
      dom.popupContent.scrollTop = 0;
    });
  });
}

function applyTemplateLanguage(root) {
  root.querySelectorAll("[data-ko][data-en]").forEach((element) => {
    element.textContent = element.dataset[state.language];
  });
  root.querySelectorAll("[data-alt-ko][data-alt-en]").forEach((element) => {
    element.alt =
      element.dataset[`alt${state.language === "ko" ? "Ko" : "En"}`];
  });
}

function closePopup() {
  if (!state.popupOpen) return;
  state.popupOpen = false;

  dom.popupBackdrop.classList.remove("is-open");
  dom.popupBackdrop.classList.add("is-closing");

  const video = dom.popupBody.querySelector("video");
  if (video) video.pause();

  window.setTimeout(() => {
    dom.popupBackdrop.classList.add("is-hidden");
    dom.popupBackdrop.classList.remove(
      "is-closing",
      "is-dragging",
      "is-settling",
    );
    dom.popupPanel.style.removeProperty("--popup-drag-y");
    dom.popupBackdrop.setAttribute("aria-hidden", "true");

    // 5번째 표본을 얻고 '탐사 완료' 팝업을 연달아 띄워야 하는 경우
    if (state.completionPending) {
      state.completionPending = false;
      window.setTimeout(openCompletionPopup, 180);
    }
    // 💡 그 외의 일반적인 경우: 팝업이 완전히 닫히면 자동으로 항해(전진) 재개
    else {
      setSailing(true);
    }
  }, 360);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
}

function bindLoadingHelm() {
  const loadingHelm = document.getElementById("loading-helm-img");
  if (!loadingHelm) return;

  let dragging = false;
  let startAngle = 0;
  let currentRotation = 0;

  // 조타륜 중심점을 기준으로 마우스의 각도(도 단위)를 계산합니다.
  const getAngle = (event) => {
    const rect = loadingHelm.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return (
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
      Math.PI
    );
  };

  loadingHelm.addEventListener("pointerdown", (event) => {
    dragging = true;
    // 잡는 순간 흔들리는 자동 애니메이션을 정지시킵니다.
    loadingHelm.style.animation = "none";
    loadingHelm.setPointerCapture(event.pointerId);
    startAngle = getAngle(event) - currentRotation;
    event.preventDefault();
  });

  loadingHelm.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const angle = getAngle(event);
    currentRotation = angle - startAngle;
    // 마우스가 움직인 각도만큼 이미지를 직접 회전시킵니다.
    loadingHelm.style.transform = `rotate(${currentRotation}deg)`;
    event.preventDefault();
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    loadingHelm.releasePointerCapture(event.pointerId);
  };

  loadingHelm.addEventListener("pointerup", endDrag);
  loadingHelm.addEventListener("pointercancel", endDrag);
}
