import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createAudioController } from "./modules/audio.js";
import { ANCHOR_ROTATION_SPEED, copy } from "./modules/config.js";
import { $, dom } from "./modules/dom.js";
import { createPickupEffectSystem } from "./modules/effects.js";
import { createOcean, createScene, resizeScene } from "./modules/scene.js";
import { state } from "./modules/state.js";
import { createUIController } from "./modules/ui.js";
import { createWakeSystem } from "./modules/wake.js";

const { scene, camera, renderer, controls, clock, sun, setSky } = createScene(
  dom.canvas,
);
const audio = createAudioController(state);
const wakeSystem = createWakeSystem(scene);
const pickupEffects = createPickupEffectSystem(scene);

let water;
let player;
let playerBox;
let mapAnchor;
let mapStart;
let mapSceneReady = false;
let playerStartInitialized = false;
let playerBaseY = -2.5;
let openingStarted = false;
let openingFinished = false;
let activePopupIndex = null;
let fifthPopupSkyChanged = false;

const triggers = new Map();
const colliders = [];
const playerForward = new THREE.Vector3();
const previousPlayerPosition = new THREE.Vector3();
const cameraFollowDelta = new THREE.Vector3();
const idealCameraPos = new THREE.Vector3();
const idealTargetPos = new THREE.Vector3();
const mapAnchorTriggerOffset = new THREE.Vector3();
const mapAnchorWorldPosition = new THREE.Vector3();
const mapAnchorTargetPosition = new THREE.Vector3();

const ui = createUIController({
  audio,
  closePopup,
  getPlayer: () => player,
  neutralizeThreat,
  setHelmSteering,
  setSailing,
  tryStartGame,
});

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
  audio.startBackgroundMusic();
  tryStartGame();
};
loadingManager.onError = (url) => console.error(`Could not load asset: ${url}`);

audio.bindBackgroundMusicUnlock();
audio.startBackgroundMusic();
ui.bind();
dom.openingSkip.addEventListener("click", finishOpeningSequence);
controls.addEventListener("start", enableFreeCameraFromInput);
loadAssets();

window.addEventListener("resize", () => resizeScene(camera, renderer), {
  passive: true,
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.sailing) setSailing(false);
});

function setLoadingProgress(value) {
  dom.loadingFill.style.width = `${value}%`;
  dom.loadingTrack.setAttribute("aria-valuenow", value);
  if (!state.assetsReady) {
    dom.loadingStatus.textContent = copy[state.language || "ko"].loading(value);
  }
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

  water = createOcean(scene, sun, normals);
  wakeSystem.create(wakeFoam);

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
    wakeSystem.setVesselSize(modelBounds.getSize(new THREE.Vector3()));
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
    player.position.set(48, -2.5, -180);
    playerBaseY = player.position.y;
  }

  player.rotation.set(0, -1.78, 0);
  player.updateMatrixWorld(true);
  previousPlayerPosition.copy(player.position);

  // Match the opening silhouette: show the starboard profile with the bow left.
  const cameraOffset = new THREE.Vector3(102, 17, 0).applyQuaternion(
    player.quaternion,
  );
  camera.position.copy(player.position).add(cameraOffset);
  controls.target.copy(player.position).add(new THREE.Vector3(0, 4, 0));
  controls.update();
  playerStartInitialized = true;
}

function tryStartGame() {
  if (
    !state.assetsReady ||
    !state.language ||
    !state.startRequested ||
    state.gameStarted ||
    openingStarted ||
    !player ||
    !triggers.size
  ) {
    return;
  }

  openingStarted = true;
  startOpeningSequence();
}

function startOpeningSequence() {
  dom.opening.classList.remove("is-hidden", "is-leaving");
  dom.opening.inert = false;
  dom.opening.setAttribute("aria-hidden", "false");
  dom.openingSkip.disabled = false;

  dom.loading.inert = true;
  dom.loading.setAttribute("aria-hidden", "true");
  dom.loading.classList.add("is-complete");
  dom.loading.addEventListener(
    "transitionend",
    () => dom.loading.classList.add("is-hidden"),
    { once: true },
  );

  dom.openingVideo.currentTime = 0;
  dom.openingVideo.addEventListener("ended", finishOpeningSequence, {
    once: true,
  });
  dom.openingVideo.addEventListener("error", finishOpeningSequence, {
    once: true,
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!openingFinished) {
        dom.openingVideo.classList.add("is-visible");
        dom.openingSkip.classList.add("is-visible");
      }
    });
  });

  const playback = dom.openingVideo.play();
  playback?.catch((error) => {
    console.warn("Opening video could not be played:", error);
    finishOpeningSequence();
  });
}

function finishOpeningSequence() {
  if (openingFinished) return;
  openingFinished = true;
  dom.openingVideo.classList.remove("is-visible");
  dom.openingSkip.classList.remove("is-visible");
  dom.openingSkip.disabled = true;

  window.setTimeout(enterGame, 750);
}

function enterGame() {
  state.gameStarted = true;
  dom.hud.classList.remove("is-hidden");
  dom.hud.setAttribute("aria-hidden", "false");
  ui.showStartGuide();
  clock.start();
  renderer.setAnimationLoop(animate);

  dom.opening.inert = true;
  dom.opening.setAttribute("aria-hidden", "true");
  dom.opening.classList.add("is-leaving");
  window.setTimeout(() => {
    dom.openingVideo.pause();
    dom.opening.classList.add("is-hidden");
  }, 800);
}

function setSailing(value) {
  state.sailing = Boolean(value) && !state.popupOpen && !state.alarmActive;
  if (state.sailing) {
    state.cameraFreeLook = false;
    state.cameraReturnElapsed = 0;
  }
  syncCameraRotation();
  ui.updateSailingUI();
}

function setHelmSteering(value) {
  state.helmSteering = Boolean(value);
  if (state.helmSteering) {
    state.cameraFreeLook = false;
    state.cameraReturnElapsed = 0;
  }
  syncCameraRotation();
}

function syncCameraRotation() {
  controls.enableRotate = !state.helmSteering;
}

function enableFreeCameraFromInput() {
  if (!state.sailing || state.helmSteering) return;
  state.cameraFreeLook = true;
  state.cameraReturnElapsed = 0;
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

  if (state.sailing && state.currentSpeed > 0.05) {
    ui.showStopGuide();
  }

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
  wakeSystem.update(player, state.currentSpeed, state.elapsed);
  pickupEffects.update(dt);
  checkTriggers();
  renderer.render(scene, camera);
  updateCompass();

  controls.update();
  water.material.uniforms.time.value += dt * 0.55;
}

function updateCompass() {
  if (!dom.compassNeedle || triggers.size === 0) return;

  const targetIndex = state.itemCount + 1;
  if (targetIndex > 5) {
    dom.compassNeedle.style.opacity = "0";
    return;
  }

  const targetTrigger = triggers.get(targetIndex);
  if (!targetTrigger) return;

  const targetCenter = new THREE.Vector3();
  targetTrigger.box.getCenter(targetCenter);
  const dx = targetCenter.x - player.position.x;
  const dz = targetCenter.z - player.position.z;
  const absoluteAngle = Math.atan2(dx, dz);
  const relativeAngle = absoluteAngle - player.rotation.y;
  const needleAngleDeg = relativeAngle * (180 / Math.PI);
  dom.compassNeedle.style.setProperty("--needle-angle", `${needleAngleDeg}deg`);
}

function updateFollowingCamera(dt) {
  if (state.sailing && (!state.cameraFreeLook || state.helmSteering)) {
    idealCameraPos
      .set(0, 35, -90)
      .applyQuaternion(player.quaternion)
      .add(player.position);
    idealTargetPos.set(
      player.position.x,
      player.position.y + 15,
      player.position.z,
    );
    camera.position.lerp(idealCameraPos, dt * 3.0);
    controls.target.lerp(idealTargetPos, dt * 4.0);

    if (!state.helmSteering) {
      state.cameraReturnElapsed += dt;
      if (state.cameraReturnElapsed >= 1.2) {
        state.cameraFreeLook = true;
        syncCameraRotation();
      }
    }
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
  if (index !== 3 && !$(`#trigger-template-${index}`)) return;
  if (!state.collected.has(index)) collectItem(index);
  if (state.handledTriggers.has(index)) return;

  state.handledTriggers.add(index);
  if (index === 3) {
    setSailing(false);
    activateThreat();
  } else {
    openPopup(index);
  }
}

function collectItem(index) {
  state.collected.add(index);
  state.itemCount = state.collected.size;

  const triggerEntry = triggers.get(index);
  if (triggerEntry) {
    const position = new THREE.Vector3();
    triggerEntry.box.getCenter(position);
    pickupEffects.createBurst(position);
  }

  if (state.itemCount === 5 && !state.completionShown) {
    state.completionShown = true;
    state.completionPending = true;
  }
}

function activateThreat() {
  state.alarmActive = true;
  dom.hud.classList.add("is-threat-active");
  dom.dangerWarning.classList.remove("is-hidden");
  dom.emergencyButton.classList.remove("is-hidden");
  audio.startAlarm();
}

function neutralizeThreat() {
  if (!state.alarmActive) return;
  state.alarmActive = false;
  dom.hud.classList.remove("is-threat-active");
  dom.dangerWarning.classList.add("is-hidden");
  dom.emergencyButton.classList.add("is-hidden");
  audio.stopAlarm();
  audio.startBackgroundMusic();
  openPopup(3);
}

function openPopup(index) {
  const template = $(`#trigger-template-${index}`);
  if (!template) return false;

  activePopupIndex = index;
  if (index === 5 && !fifthPopupSkyChanged) {
    fifthPopupSkyChanged = true;
    setSky({ elevation: -1, azimuth: -130, environmentIntensity: 100 });
    water?.material.uniforms.sunDirection.value.copy(sun).normalize();
  }
  markTriggerPopupOpened(index);
  state.popupOpen = true;
  setSailing(false);
  dom.popupKicker.textContent = copy[state.language].popupKickers[index - 1];
  dom.popupTitle.textContent = copy[state.language].titles[index - 1];
  dom.popupIndex.textContent = String(index).padStart(2, "0");
  dom.popupBody.replaceChildren(template.content.cloneNode(true));
  ui.applyTemplateLanguage(dom.popupBody);
  ui.showPopup();
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
  activePopupIndex = null;
  state.popupOpen = true;
  setSailing(false);
  dom.popupKicker.textContent = copy[state.language].completeKicker;
  dom.popupTitle.textContent = copy[state.language].completeTitle;
  dom.popupIndex.textContent = "✓";
  dom.popupBody.replaceChildren(
    $("#completion-template").content.cloneNode(true),
  );
  ui.applyTemplateLanguage(dom.popupBody);
  ui.showPopup();
}

function closePopup() {
  if (!state.popupOpen) return;
  const closedPopupIndex = activePopupIndex;
  const isCompletionPopup = closedPopupIndex === null;
  activePopupIndex = null;
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

    if (closedPopupIndex === 5 && state.completionPending) {
      state.completionPending = false;
      window.setTimeout(openCompletionPopup, 1730);
    } else {
      setSailing(!isCompletionPopup);
    }
  }, 360);
}
