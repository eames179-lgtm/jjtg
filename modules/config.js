export const copy = {
  ko: {
    loading: (n) => `항해를 준비하는 중 · ${n}%`,
    ready: "100%",
    waiting: "100%",
    start: "항해 시작",
    helmGuideStart: "조타륜 가운데 빨간 점을 탭하면 항해가 시작됩니다.",
    helmGuideStop: "조타륜 가운데 파란 점을 탭하면 정박합니다.",
    close: "닫기",
    dangerCode: "접근 경보 · 위험 단계",
    danger: "대함 미사일이 접근하고 있습니다.",
    emergency: "요격 미사일 발사",
    popupKickers: [
      "전설의 시작",
      "Aegis.. 이건 어떻게 읽는거야?",
      "뭔가 큰일이 일어난 것 같아",
      "미사일이 갑판에서 갑자기 솟아 올랐어",
      "누군가 날 지켜보는 것 같아. 분명 아무도 없는데",
    ],
    titles: [
      "출항준비 완료",
      "신의 방패, 이지스",
      "안심하세요",
      "한국형수직발사체계",
      "유령 사냥",
    ],
    completeKicker: "끝",
    completeTitle: "임무 완료",
  },
  en: {
    loading: (n) => `LOADING EXPEDITION DATA · ${n}%`,
    waiting: "",
    start: "START VOYAGE",
    helmGuideStart: "Tap the red dot at the center of the helm to set sail.",
    helmGuideStop: "Tap the blue dot at the center of the helm to stop.",
    close: "CLOSE",
    dangerCode: "PROXIMITY ALERT · CRITICAL",
    danger: "A radioactive missile is approaching.",
    emergency: "LAUNCH ANTI-AIR MISSILE",
    popupKickers: [
      "OCEAN RESEARCH FIELD LOG",
      "OCEAN RESEARCH FIELD LOG",
      "OCEAN RESEARCH FIELD LOG",
      "OCEAN RESEARCH FIELD LOG",
      "OCEAN RESEARCH FIELD LOG",
    ],
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

export const AUDIO_LEVELS = {
  bgm: 0.34,
  bgmDucked: 0.045,
  alarm: 0.82,
  popup: 0.53,
};

export const AUDIO_UNLOCK_EVENTS = ["pointerdown", "keydown"];

export const WAKE = {
  maxSections: 120,
  sampleSpacing: 1.65,
  lifetime: 3.5,
  surfaceY: 0.12,
  maxHalfWidth: 12.5,
};

export const ANCHOR_ROTATION_SPEED = (8 * Math.PI * 2) / 60;
