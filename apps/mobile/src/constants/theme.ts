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

/** 움직임은 승인 카드 등장 한 곳에 힘을 준다. 나머지는 버튼 눌림(0.97)뿐. */
export const motion = { approvalEnterMs: 240, pressScale: 0.97 } as const;

export const hitSlop = 8;
