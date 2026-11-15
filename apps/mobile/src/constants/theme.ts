// 디자인 방향 A "차분한 코발트" (2026-11-15 선택). 시안: danchuai-design/screens-a.html
// 색은 이 파일에서만 정한다. 화면은 이름(tokens.ink 등)으로만 쓴다.

export const tokens = {
  bg: '#f7f8fa',
  card: '#ffffff',
  ink: '#14171c',
  body: '#2c3139',
  muted: '#5d6470',
  faint: '#8c929c',
  line: '#e3e6eb',
  accent: '#2e4bc6',
  onAccent: '#f7f8fa',
  chip: '#eceff5',
  inputLine: '#d3d8e0',
  /** 기관끼리 다른 값, 빈 항목에만 쓴다 */
  highlight: '#fff1b8',
  onHighlight: '#3b2f00',
} as const;

export const radius = { card: 14, bubble: 18, sheet: 22, button: 14, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
