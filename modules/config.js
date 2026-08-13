export const copy = {
  ko: {
    loading: (n) => `항해를 준비하는 중 · ${n}%`,
    ready: "100%",
    waiting: "100%",
    start: "항해 시작",
    close: "닫기",
    dangerCode: "접근 경보 · 위험 단계",
    danger: "대함 미사일이 접근하고 있습니다.",
    emergency: "요격 미사일 발사",
    popupKickers: [
      "누추한 내가 이렇게 귀한 배를 조종해도 되나",
      "Aegis.. 이건 어떻게 읽는거야?",
      "아이 깜짝이야! 무슨 일이야",
      "분명히 갑판에 미사일이 있는 걸 못봤는데",
      "누군가 날 지켜보는 것 같아. 분명 아무도 없는데",
    ],
    titles: [
      "첫 항해",
      "신의 방패, 이지스",
      "비상사태",
      "한국형수직발사대 KVLS",
      "유령 사냥",
    ],
    completeKicker: "끝",
    completeTitle: "임무 완료",
  },
  en: {
    loading: (n) => `LOADING EXPEDITION DATA · ${n}%`,
    waiting: "",
    start: "START VOYAGE",
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
