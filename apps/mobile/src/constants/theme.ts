// Muse 시안 (2026-11-25, 사용자 승인 "좋아 전체 반영하자"). 시안: claude.ai/artifact/28gXYnuMwCfn2XP8uZJC7o
// 색은 Muse 화면 픽셀에서 잰 값이다. 색은 이 파일에서만 정한다. 화면은 이름(tokens.ink 등)으로만 쓴다.
// 파랑(primary) 하나가 허용·주 버튼·확인 필요에 쓰인다. 초록(ok)은 "연결됨"·"지켜보는 중" 점에만, 호박(wait)은 기한·기다림에만.

export const tokens = {
  /** 바탕 */
  bg: '#fdfdfd',
  /** 카드·확인 카드·탭 막대 */
  surface: '#ffffff',
  /** 설정 묶음·시트 바탕 */
  group: '#f4f5f7',
  /** 칩·회색 버튼·뼈대 */
  sunken: '#eeeff1',
  /** 지금 고른 탭·서랍 줄 */
  selected: '#e9eaed',
  border: '#e3e4e8',
  borderInput: '#8a8b91',
  text: '#121214',
  muted: '#64656b',
  faint: '#6c6d73',
  ink: '#121214',
  onInk: '#ffffff',
  /** 비서 말풍선 */
  agentBubble: '#e8e8ea',
  /** 내 말풍선 */
  myBubble: '#b2d5ff',
  /** 허용·주 버튼 */
  primary: '#0447d6',
  onPrimary: '#ffffff',
  /** 링크 */
  link: '#2862cd',
  /** 일하는 중·확인 필요(Muse 파랑과 같은 색) */
  accent: '#0447d6',
  accentSoft: '#e4ecfd',
  /** 연결됨·지켜보는 중 점 */
  ok: '#1e8e4e',
  okSoft: '#e3f4ea',
  wait: '#8a5a00',
  waitSoft: '#fbf0d9',
  danger: '#b0362e',
  scrim: 'rgba(18, 18, 20, 0.04)',
  /** 시트·서랍 뒤를 어둡게 하는 막 */
  overlay: 'rgba(18, 18, 20, 0.32)',
} as const;

/**
 * 화면 비율. 2026-11-17에 1.3배로 정했다가, 2026-11-25 사용자 선택 "모든 화면을 시안 크기로"(Muse 시안 반영)에 따라 1배로 바꿨다.
 * Muse 시안은 390px 휴대폰 화면 그대로 쟀으므로 배율 없이 쓴다. 숫자 크기는 그대로 u(px)로 쓴다.
 */
export const SCALE = 1;
export const u = (px: number) => Math.round(px * SCALE * 10) / 10;

/** 대화 화면 비율. 2026-11-20에 1.1배였다가 2026-11-25부터 다른 화면과 같이 1배(시안 크기). */
export const CHAT_SCALE = 1;
export const uc = (px: number) => Math.round(px * CHAT_SCALE * 10) / 10;


/** 원티드 산스(OFL). assets/fonts/OFL.txt */
export const fonts = {
  regular: 'WantedSans-Regular',
  medium: 'WantedSans-Medium',
  semibold: 'WantedSans-SemiBold',
  bold: 'WantedSans-Bold',
} as const;

/** 버튼·칩은 알약, 카드 20, 카드 안 상자 12, 승인 카드 28 */
export const radius = { inner: u(12), card: u(20), approval: u(28), bubble: u(20), pill: 999 } as const;
export const space = { xs: u(4), sm: u(8), md: u(12), lg: u(16), xl: u(20), xxl: u(24) } as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: u(26), lineHeight: u(32), letterSpacing: u(-0.5) },
  /** 시안 t22: 두 줄 제목(동의 화면) */
  title2: { fontFamily: fonts.bold, fontSize: u(22), lineHeight: u(30), letterSpacing: u(-0.4) },
  heading: { fontFamily: fonts.bold, fontSize: u(18), lineHeight: u(24), letterSpacing: u(-0.2) },
  nav: { fontFamily: fonts.semibold, fontSize: u(16), lineHeight: u(22) },
  agent: { fontFamily: fonts.regular, fontSize: u(16), lineHeight: u(27) },
  body: { fontFamily: fonts.regular, fontSize: u(15), lineHeight: u(23) },
  label: { fontFamily: fonts.semibold, fontSize: u(15), lineHeight: u(20) },
  small: { fontFamily: fonts.regular, fontSize: u(14), lineHeight: u(20) },
  caption: { fontFamily: fonts.medium, fontSize: u(13), lineHeight: u(18) },
  /** 대화 화면: 비서 글, 내 말풍선, 작은 글, 단계·보조 글, 라벨, 비서 홈 제목 */
  chatAgent: { fontFamily: fonts.regular, fontSize: uc(15), lineHeight: uc(24) },
  chatBody: { fontFamily: fonts.regular, fontSize: uc(15), lineHeight: uc(22) },
  chatSmall: { fontFamily: fonts.regular, fontSize: uc(13.5), lineHeight: uc(19) },
  chatCaption: { fontFamily: fonts.medium, fontSize: uc(12), lineHeight: uc(17) },
  chatLabel: { fontFamily: fonts.semibold, fontSize: uc(14), lineHeight: uc(19) },
  chatTitle: { fontFamily: fonts.bold, fontSize: uc(20), lineHeight: uc(27), letterSpacing: uc(-0.3) },
  /** Muse 탭 화면: 큰 제목, 줄 제목, 줄 본문, 작은 글, 머리 이름·상태 */
  museTitle: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
  museHead: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  museRow: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  museBody: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 22 },
  museSmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  museName: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 16 },
  museStatus: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15 },
  /** 화면에 하나만 두는 상태 숫자(제출 2/4곳, 3일 남음) */
  stat: { fontFamily: fonts.bold, fontSize: u(32), lineHeight: u(38), letterSpacing: u(-0.6) },
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
    /** 진행 중 점 셋이 한 번 밝아지는 주기 */
    dots: 900,
  },
  /** 줄 단위 등장 때 올라오는 거리 */
  lineRise: u(8),
  popFrom: 0.9,
  popTo: 0.95,
  likeFrom: 0.6,
  /** 좋아요 톡 튕김: 약 1.07까지 넘쳤다가 0.4초 안에 멈춤 */
  like: { stiffness: 700, damping: 26, mass: 1 },
} as const;

export const hitSlop = 8;
