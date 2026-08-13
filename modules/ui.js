import * as THREE from "three";
import { copy } from "./config.js";
import { $, dom } from "./dom.js";
import { state } from "./state.js";

export function createUIController({
  audio,
  closePopup,
  getPlayer,
  neutralizeThreat,
  setSailing,
  tryStartGame,
}) {
  function bind() {
    document
      .querySelectorAll(".language-button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          selectLanguage(button.dataset.language),
        ),
      );

    const startButton = document.getElementById("start-voyage-button");
    if (startButton) {
      startButton.addEventListener("click", () => {
        audio.startBackgroundMusic();
        state.startRequested = true;
        tryStartGame();
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

      const dismissDistance = Math.min(
        160,
        dom.popupPanel.clientHeight * 0.24,
      );
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
    audio.startBackgroundMusic();
    state.language = language;
    document.documentElement.lang = language;
    audio.primeAlarmAudio();
    applyLanguage();

    document.querySelectorAll(".language-button").forEach((button) => {
      button.classList.toggle(
        "is-selected",
        button.dataset.language === language,
      );
    });

    const startButton = document.getElementById("start-voyage-button");
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = copy[language].start;
    }
  }

  function applyLanguage() {
    const text = copy[state.language];
    dom.popupClose.textContent = text.close;
    dom.dangerCode.textContent = text.dangerCode;
    dom.dangerText.textContent = text.danger;
    dom.emergencyLabel.textContent = text.emergency;
    dom.languageToggle.textContent = state.language === "ko" ? "EN" : "KR";
    updateSailingUI();
    if (!state.assetsReady) {
      dom.loadingStatus.textContent = text.loading(
        Number(dom.loadingTrack.getAttribute("aria-valuenow")) || 0,
      );
    } else if (!state.gameStarted) {
      dom.loadingStatus.textContent = text.waiting;
    }
    if (state.popupOpen) applyTemplateLanguage(dom.popupBody);
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
      ) {
        return;
      }
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
      const player = getPlayer();
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
      if (dom.helm.hasPointerCapture(event.pointerId)) {
        dom.helm.releasePointerCapture(event.pointerId);
      }

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

        if (
          Math.abs(displayedWheelAngle) < 0.1 &&
          Math.abs(helmVelocity) < 0.1
        ) {
          displayedWheelAngle = 0;
          helmVelocity = 0;
          dom.helm.style.setProperty("--helm-angle", "0deg");
          snapAnimationId = null;
        } else {
          snapAnimationId = requestAnimationFrame(snapBack);
        }
      };
      snapAnimationId = requestAnimationFrame(snapBack);
    };

    dom.helm.addEventListener("pointerup", endDrag);
    dom.helm.addEventListener("pointercancel", (event) =>
      endDrag(event, true),
    );
    dom.helm.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSailing(!state.sailing);
    });
  }

  function updateSailingUI() {
    if (!state.language) return;
    dom.helm.classList.toggle("is-sailing", state.sailing);
  }

  function bindLoadingHelm() {
    const loadingHelm = document.getElementById("loading-helm-img");
    if (!loadingHelm) return;

    let dragging = false;
    let startAngle = 0;
    let currentRotation = 0;

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
      loadingHelm.style.animation = "none";
      loadingHelm.setPointerCapture(event.pointerId);
      startAngle = getAngle(event) - currentRotation;
      event.preventDefault();
    });

    loadingHelm.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const angle = getAngle(event);
      currentRotation = angle - startAngle;
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

  function applyTemplateLanguage(root) {
    root.querySelectorAll("[data-ko][data-en]").forEach((element) => {
      element.textContent = element.dataset[state.language];
    });
    root.querySelectorAll("[data-alt-ko][data-alt-en]").forEach((element) => {
      element.alt =
        element.dataset[`alt${state.language === "ko" ? "Ko" : "En"}`];
    });
  }

  function showPopup() {
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
    audio.playPopupSound();

    window.requestAnimationFrame(() => {
      dom.popupContent.scrollTop = 0;
      window.requestAnimationFrame(() => {
        dom.popupContent.scrollTop = 0;
      });
    });
  }

  return { applyTemplateLanguage, bind, showPopup, updateSailingUI };
}
