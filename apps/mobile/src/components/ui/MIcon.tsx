// 시안 원본(muse-sian-source-1125 m01~m15.html)에 쓰인 선 그림 그대로. 24칸, 선 1.8, 둥근 끝.
// 시안과 모양을 똑같이 맞추려고 원본의 경로를 옮겼다(Muse 앱의 아이콘이 아니라 시안을 만들 때 그린 단순 선 그림).
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '@/constants/theme';

const P = (d: string) => ({ t: 'p' as const, d });
const C = (cx: number, cy: number, r: number) => ({ t: 'c' as const, cx, cy, r });
const R = (x: number, y: number, w: number, h: number, rx: number) => ({ t: 'r' as const, x, y, w, h, rx });
type Part = ReturnType<typeof P> | ReturnType<typeof C> | ReturnType<typeof R>;

const ICONS = {
  menu: [P('M5 9h14M5 15h14')],
  plus: [P('M12 5v14M5 12h14')],
  mic: [R(9, 3, 6, 11, 3), P('M5 11a7 7 0 0 0 14 0M12 18v3')],
  chat: [P('M4 12a8 7 0 1 1 3.5 5.8L4 19l1-3.4A6.8 6.8 0 0 1 4 12z')],
  feed: [R(5, 4, 14, 16, 2.5), P('M9 9h6M9 13h6M9 17h3')],
  idea: [P('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z')],
  todo: [R(4, 4, 16, 16, 3), P('M8.5 12l2.5 2.5 4.5-5')],
  library: [R(4, 4, 6.5, 6.5, 2), R(13.5, 4, 6.5, 6.5, 2), R(4, 13.5, 6.5, 6.5, 2), R(13.5, 13.5, 6.5, 6.5, 2)],
  info: [C(12, 12, 8.5), P('M12 11v5M12 8h.01')],
  doc: [P('M7 3h7l4 4v14H7z'), P('M14 3v4h4M10 12h5M10 16h5')],
  person: [C(12, 8.5, 3.8), P('M5 20a7 7 0 0 1 14 0')],
  chevron: [P('M9 6l6 6-6 6')],
  back: [P('M15 5l-7 7 7 7')],
  sliders: [P('M4 7h10M18 7h2M4 17h4M12 17h8'), C(16, 7, 2), C(10, 17, 2)],
  heart: [P('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z')],
  talk: [P('M5 12a7 6 0 1 1 3 5l-3 1 .8-2.8A6 6 0 0 1 5 12z')],
  check: [P('M5 12l4 4L19 6')],
  clock: [C(12, 12, 8.5), P('M12 7.5V12l3 2')],
  list: [P('M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01')],
  bell: [P('M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z'), P('M10 20a2 2 0 0 0 4 0')],
  more: [C(5, 12, 1.3), C(12, 12, 1.3), C(19, 12, 1.3)],
  pin: [P('M12 21v-6M7 4h10l-1.5 5 2.5 3H6l2.5-3z')],
  gear: [C(12, 12, 3), P('M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8')],
  search: [C(11, 11, 6.5), P('M20 20l-4-4')],
  compose: [P('M5 19h4L19 9l-4-4L5 15z'), P('M13 7l4 4')],
  close: [P('M6 6l12 12M18 6L6 18')],
  share: [P('M12 15V4M8 8l4-4 4 4'), P('M6 12v7h12v-7')],
  pencil: [P('M14.5 5.5l4 4L9 19H5v-4z')],
  plug: [P('M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0z'), P('M12 16v5')],
  phone: [R(7, 3, 10, 18, 2.5), P('M11 18h2')],
  shield: [P('M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z'), P('M9 12l2 2 4-4')],
  lock: [R(5, 11, 14, 9, 2), P('M8 11V8a4 4 0 0 1 8 0v3')],
  brush: [P('M14 4l6 6-8 8-6-6z'), P('M6 12l-2 6 6-2')],
  arrowUp: [P('M12 19V5M6 11l6-6 6 6')],
} satisfies Record<string, Part[]>;

export type MIconName = keyof typeof ICONS;

export function MIcon({ name, size = 20, color = tokens.text, width = 1.8 }: { name: MIconName; size?: number; color?: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((p, i) =>
        p.t === 'p' ? <Path key={i} d={p.d} /> : p.t === 'c' ? <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} /> : <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} />,
      )}
    </Svg>
  );
}
