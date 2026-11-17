// 시안 v3 (2026-11-15). 시안: danchuai-design/v3/screens-v3.html, 근거: v3/recon.md, tokens.json
// 색은 이 파일에서만 정한다. 화면은 이름(tokens.ink 등)으로만 쓴다.
// 청록(accent)은 "에이전트가 일하는 중"과 "기관끼리 다른 항목"에만, 호박(wait)은 "기다리는 중"에만 쓴다.

export const tokens = {
  bg: '#f6f6f5',
  surface: '#fdfdfc',
  sunken: '#ededeb',
  border: '#e2e2df',
  borderInput: '#8a8b87',
  text: '#1e1f22',
  muted: '#64655f',
  faint: '#6f706a',
  ink: '#1e1f22',
  onInk: '#fdfdfc',
  accent: '#0a7360',
  accentSoft: '#e3f1ed',
  wait: '#8a5a00',
  waitSoft: '#fbf0d9',
  danger: '#b0362e',
  scrim: 'rgba(30, 31, 34, 0.04)',
  /** 시트·팝업 뒤를 어둡게 하는 막 */
  overlay: 'rgba(30, 31, 34, 0.38)',
} as const;

/** 원티드 산스(OFL). assets/fonts/OFL.txt */
export const fonts = {
  regular: 'WantedSans-Regular',
  medium: 'WantedSans-Medium',
  semibold: 'WantedSans-SemiBold',
  bold: 'WantedSans-Bold',
} as const;

/** 버튼·칩은 알약, 카드 20, 카드 안 상자 12, 승인 카드 28 */
export const radius = { inner: 12, card: 20, approval: 28, bubble: 20, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  nav: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  agent: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 27 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const;

/**
 * 움직임 기준 (2026-11-17 사용자 지정, 시안 scratchpad/anim/motion.html).
 * 들어올 때 ease-out, 나갈 때 ease-in, 0.2~0.4초. 곡선은 lib/motion.ts.
 * 동작 줄이기가 켜지면 이동을 없애고 0.2초 흐림 전환만 남긴다.
 */
export const motion = {
  pressScale: 0.97,
  ms: {
    press: 200,
    toastIn: 200,
    toastOut: 200,
    toastShow: 2000,
    snackIn: 280,
    snackOut: 200,
    snackShow: 5000,
    popIn: 240,
    popOut: 200,
    sheetIn: 320,
    sheetOut: 240,
    scrimIn: 240,
    checkFill: 200,
    checkDraw: 280,
    checkDelay: 60,
    checkOff: 200,
    /** 로딩 한 바퀴 0.4초, 등속 */
    spin: 400,
    /** 동작 줄이기 때 로딩 표시가 밝아졌다 흐려지는 한 주기 */
    spinReduced: 1200,
    line: 320,
    stagger: 70,
    reduced: 200,
  },
  /** 줄 단위 등장 때 올라오는 거리 */
  lineRise: 8,
  popFrom: 0.9,
  popTo: 0.95,
  likeFrom: 0.6,
  /** 좋아요 톡 튕김: 약 1.07까지 넘쳤다가 0.4초 안에 멈춤 */
  like: { stiffness: 700, damping: 26, mass: 1 },
} as const;

export const hitSlop = 8;
