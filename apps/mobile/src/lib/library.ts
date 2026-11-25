// 자료 탭 결과물(시안 원본 m08): 비서가 만들었거나 허용을 받아 단추로 보낸 것. 최근 것부터.
// 기관은 견적서·기록을 만든 실행 기록과 보낸 것, 의뢰자는 보낸 것만. 실패·되돌린 것은 결과물이 아니라서 뺀다.
import type { AssistRunView } from './agentClient';
import { sentLabel, type SentItem } from './sent';

export interface DocRow {
  id: string;
  title: string;
  at: string;
  rfqNo: string | null;
}

/** 결과물이 남는 실행(견적서·미팅 기록) */
const MADE = new Set(['quote_doc', 'quote_doc_edit', 'quote_doc_set_amount', 'quote_draft', 'crm_activity']);
const MADE_NAME: Record<string, string> = { quote_doc: '견적서', quote_doc_edit: '견적서 고친 판', quote_doc_set_amount: '견적서 금액', quote_draft: '견적 임시 저장', crm_activity: '미팅 기록' };

export function libraryRows(sent: SentItem[], runs: AssistRunView[] = []): DocRow[] {
  const a: DocRow[] = sent.filter((s) => s.status === 'sent').map((s) => ({ id: `s:${s.id}`, title: [sentLabel(s.action), s.rfqNo].filter(Boolean).join(', '), at: s.at, rfqNo: s.rfqNo }));
  const b: DocRow[] = runs.filter((r) => MADE.has(r.action) && r.outcome === 'done' && !r.undone).map((r) => ({ id: `r:${r.id}`, title: MADE_NAME[r.action] ?? r.label, at: r.createdAt, rfqNo: null }));
  return [...a, ...b].sort((x, y) => y.at.localeCompare(x.at));
}

/** "오늘 14:20", "어제", "11월 24일" (기기 시간) */
export function whenShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
