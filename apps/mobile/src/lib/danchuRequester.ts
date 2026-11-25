// 의뢰자: 선정 없이 마무리·보류한 요청 다시 열기·요청 첨부 추가·받은 계약서(안)·기관 견적서 (2026-11-25).
// 규칙은 단추 라우트와 같다: 마무리 app/api/rfq/[no]/outcome, 다시 열기 .../reopen, 첨부 .../files/retry·confirm.
// 여기서 먼저 막는 것은 사람이 시트에서 바로 고칠 수 있게 하려는 것이고, 최종 판단은 단추가 한 번 더 한다.

/** 요청 상태 가운데 이 화면이 보는 칸. outcome 은 단추가 보내기 시작하기 전까지 없을 수 있다 */
export interface RequestState {
  status: string;
  selected: boolean;
  compareOpen: boolean;
  outcome?: string | null;
}

const ENDED = ['closed', 'cancelled'];

export const CLOSE_OUTCOMES = ['외부 진행', '보류', '취소'] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];
export const CLOSE_HELP: Record<CloseOutcome, string> = {
  '외부 진행': '단추 밖에서 기관과 진행해요',
  보류: '당장은 진행하지 않아요',
  취소: '시험 계획이 바뀌었어요',
};

export const canClose = (r: RequestState) => !r.selected && !ENDED.includes(r.status);
/** 비교표가 열린 뒤 보류한 요청만(열기 전 보류는 새 요청으로, 단추 2026-10-20 결정 1). 기간·받은 견적은 단추가 본다 */
export const canReopen = (r: RequestState) => r.outcome === '보류' && r.status === 'closed' && !r.selected && r.compareOpen;
export const canAttach = (r: RequestState) => !ENDED.includes(r.status);

type Built = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

export function closeBody(outcome: CloseOutcome | null, note: string): Built {
  if (!outcome) return { ok: false, error: '마무리 사유를 골라 주세요' };
  const n = note.trim();
  if (n.length > 500) return { ok: false, error: '500자까지 적을 수 있어요' };
  if (outcome === '외부 진행' && !n) return { ok: false, error: '어느 기관과 진행하는지 적어 주세요' };
  return { ok: true, body: { outcome, ...(n ? { note: n } : {}) } };
}

/** 단추 lib/upload RFQ_FILE_EXTS 와 같다 */
const FILE_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx', 'hwp'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 올릴 수 없는 파일이면 이유, 괜찮으면 null */
export function fileProblem(name: string, size: number): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name.trim())?.[1]?.toLowerCase();
  if (!ext || !FILE_EXTS.includes(ext)) return 'PDF, 그림, 워드, 엑셀, 한글 파일만 올릴 수 있어요';
  if (size <= 0) return '빈 파일은 올릴 수 없어요';
  if (size > MAX_FILE_BYTES) return '20MB 이하 파일만 올릴 수 있어요';
  return null;
}

/** request_file_url 결과에서 올릴 경로·주소. 같은 파일을 이미 올렸으면({uploaded:true}) null */
export function uploadedPath(result: unknown): { path: string; signedUrl: string } | null {
  if (!result || typeof result !== 'object') return null;
  const { path, signedUrl } = result as { path?: unknown; signedUrl?: unknown };
  if (typeof path !== 'string' || typeof signedUrl !== 'string' || !signedUrl.startsWith('https://')) return null;
  return { path, signedUrl };
}

/** 고른 파일을 단추가 준 서명 주소로 올린다(단추 웹 lib/upload uploadToSigned 와 같은 방식, 주소는 두 시간 동안만 쓸 수 있다) */
export async function putSigned(signedUrl: string, file: { uri: string; mime: string }, fetchImpl: typeof fetch = fetch): Promise<void> {
  const blob = await (await fetchImpl(file.uri)).blob();
  const res = await fetchImpl(signedUrl, { method: 'PUT', headers: { 'content-type': file.mime }, body: blob });
  if (!res.ok) throw new Error(`upload ${res.status}`);
}

/** request_file_done 결과: 단추가 저장소에서 파일을 찾아 확인까지 끝냈는지. 못 찾아도 200({complete:false})이 온다 */
export const uploadConfirmed = (result: unknown): boolean => !!result && typeof result === 'object' && (result as { complete?: unknown }).complete === true;

/** 단추 quote_view: 기관이 견적서 툴로 만든 견적서(제출 금액과 같은 것). 비교표가 열린 뒤에만 */
export interface QuoteDocView {
  croName: string;
  docNo: string;
  validUntil: string | null;
  tests: { rfqSeq: number | null; title: string; weeks: number | null; total: number; groups: { label: string; m: number; f: number; rm: number; rf: number }[]; options: { name: string; on: boolean }[] }[];
  totals: { sum: number; discount: number; supply: number; vat: number; grand: number };
  terms: { pay: string; extra: string; note: string };
  path: string;
}

/** 단추 contract_draft_view: 선정한 기관이 보낸 계약서(안). 금액은 선정 견적 그대로(단추 계산) */
export interface ReceivedDraftView {
  sentAt: string;
  path: string;
  draft: {
    title: string;
    tests: { seq: number; name: string; amount: number; weeks: number | null }[];
    supply: number;
    vat: number;
    total: number;
    articles: { no: number; title: string; body: string[] }[];
    special: string[];
    cro: { name: string };
  };
}

/** 군 구성 한 줄("1군 수10 암10, 회복 수5 암5") */
export function groupLine(g: QuoteDocView['tests'][number]['groups'][number]): string {
  const main = `${g.label} 수${g.m} 암${g.f}`;
  return g.rm || g.rf ? `${main}, 회복 수${g.rm} 암${g.rf}` : main;
}
