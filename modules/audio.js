import * as THREE from "three";
import { AUDIO_LEVELS, AUDIO_UNLOCK_EVENTS } from "./config.js";

export function createAudioController(state) {
  let alarmAudio;
  let bgmAudio;
  let popupAudio;
  const audioFades = new WeakMap();

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
    const target = state.alarmActive
      ? AUDIO_LEVELS.bgmDucked
      : AUDIO_LEVELS.bgm;
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
          // Browsers retry autoplay after the first user interaction.
        });
    }
  }

  function primeAlarmAudio() {
    ensureAudio();
    if (!alarmAudio.paused || state.alarmActive) return;
    alarmAudio.muted = true;
    const attempt = alarmAudio.play();
    if (attempt) {
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
  }

  function playPopupSound() {
    ensureAudio();
    popupAudio.pause();
    popupAudio.currentTime = 0;
    popupAudio.play().catch(() => {
      // Audio is optional; gameplay remains functional when unavailable.
    });
  }

  function startAlarm() {
    ensureAudio();
    fadeAudio(bgmAudio, AUDIO_LEVELS.bgmDucked, 650);
    alarmAudio.muted = false;
    alarmAudio.volume = 0;
    alarmAudio.currentTime = 0;
    const attempt = alarmAudio.play();
    if (attempt) {
      attempt
        .then(() => fadeAudio(alarmAudio, AUDIO_LEVELS.alarm, 420))
        .catch(() => {});
    }
  }

  function stopAlarm() {
    if (!alarmAudio) return;
    fadeAudio(alarmAudio, 0, 720, () => {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    });
  }

  return {
    bindBackgroundMusicUnlock,
    playPopupSound,
    primeAlarmAudio,
    startAlarm,
    startBackgroundMusic,
    stopAlarm,
  };
}
