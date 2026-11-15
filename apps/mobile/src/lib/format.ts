// 화면 표시 도우미(순수 함수).

/** 오늘·어제·M월 D일 (기기 시간대) */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 기관 이름 첫 글자(아바타) */
export const initialOf = (name: string) => Array.from(name.trim())[0] ?? '?';
