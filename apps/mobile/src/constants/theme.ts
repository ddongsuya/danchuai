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

/**
 * 화면 비율 (2026-11-17 사용자 선택, 고르기 보드 "시안과 같은 비율").
 * 시안은 300px 폭 화면에 그렸다. 390px 휴대폰에서 같은 비율로 보이도록 모든 크기(글자·여백·버튼·아이콘·모서리)를 1.3배로 쓴다.
 * 화면에 숫자 크기를 쓸 때는 u(시안 px)로 쓴다.
 */
export const SCALE = 1.3;
export const u = (px: number) => Math.round(px * SCALE * 10) / 10;

/**
 * 대화 화면 비율 (2026-11-20 사용자: "채팅 화면의 UI 사이즈를 작게").
 * 말풍선·비서 글·입력창·단계 표시·비서 홈은 1.3배 대신 1.1배로 쓴다. 다른 화면(목록·카드·시트)은 u() 그대로.
 */
export const CHAT_SCALE = 1.1;
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
  /** 대화 화면(1.1배): 비서 글, 내 말풍선, 작은 글, 단계·보조 글, 라벨, 비서 홈 제목 */
  chatAgent: { fontFamily: fonts.regular, fontSize: uc(15), lineHeight: uc(24) },
  chatBody: { fontFamily: fonts.regular, fontSize: uc(15), lineHeight: uc(22) },
  chatSmall: { fontFamily: fonts.regular, fontSize: uc(13.5), lineHeight: uc(19) },
  chatCaption: { fontFamily: fonts.medium, fontSize: uc(12), lineHeight: uc(17) },
  chatLabel: { fontFamily: fonts.semibold, fontSize: uc(14), lineHeight: uc(19) },
  chatTitle: { fontFamily: fonts.bold, fontSize: uc(20), lineHeight: uc(27), letterSpacing: uc(-0.3) },
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
