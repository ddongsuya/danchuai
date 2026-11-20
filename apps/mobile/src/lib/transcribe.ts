// 회의 녹음 전사(2026-11-20). 녹음 파일은 에이전트 서버를 거치지 않는다.
// 서버에서 전사 서비스 임시 토큰을 받고(참석자 동의 확인 필요), 앱이 녹음을 전사 서비스(Deepgram)에 바로 보내 글을 받는다.
// 전사본은 기관 비서 한 턴에만 붙여 보낸다(서버는 대화 기록에 남기지 않는다).
// 이 파일은 순수 함수만 둔다(테스트가 앱 모듈 없이 돈다). 토큰 받기는 agentClient.getSttTicket.

export interface SttTicket {
  provider: 'deepgram';
  token: string;
  expiresIn: number;
  url: string;
}

export type SttFailure = 'not_configured' | 'usage_limit' | 'too_long' | 'stt_failed' | 'empty' | 'network';

export class SttError extends Error {
  constructor(readonly code: SttFailure) {
    super(code);
  }
}

/** 서버 오류(AgentHttpError: code·status) → 전사 실패 코드 */
export function sttFailureOf(e: unknown): SttFailure {
  if (e instanceof SttError) return e.code;
  const h = e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number; code?: unknown }) : null;
  if (h) {
    if (h.status === 404) return 'not_configured';
    if (h.status === 413) return 'too_long';
    if (h.code === 'usage_limit' || h.status === 429) return 'usage_limit';
    if (h.status === 0) return 'network';
  }
  return 'stt_failed';
}

/**
 * Deepgram 응답 → 전사본(순수 함수). 화자 나누기 문단이 있으면 그것을 쓰고 "Speaker 0" 을 "화자 1" 로 바꾼다.
 * 글이 없으면 null
 */
export function transcriptOf(json: unknown): string | null {
  const alt = (json as { results?: { channels?: { alternatives?: { transcript?: unknown; paragraphs?: { transcript?: unknown } }[] }[] } } | null)?.results?.channels?.[0]?.alternatives?.[0];
  const raw = typeof alt?.paragraphs?.transcript === 'string' && alt.paragraphs.transcript.trim() ? alt.paragraphs.transcript : typeof alt?.transcript === 'string' ? alt.transcript : '';
  const text = raw
    .replace(/Speaker (\d+):/g, (_m, n: string) => `화자 ${Number(n) + 1}:`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text : null;
}

/** 파일 이름·형식 → 전사 서비스에 알릴 형식 */
export function audioMime(name: string, given?: string | null): string {
  if (given && /^audio\/[\w.+-]+$/.test(given)) return given;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', '3gp': 'audio/3gpp', amr: 'audio/amr', flac: 'audio/flac' }[ext] ?? 'audio/*';
}

/** 고른 파일의 길이를 모를 때 크기로 어림한다(64kbps 가정, 1분 이상, 상한까지) */
export const minutesFromSize = (bytes: number, max = 180) => Math.min(max, Math.max(1, Math.ceil(bytes / ((64_000 / 8) * 60))));

/** 녹음 하나를 글로 옮긴다. 토큰은 요청을 시작할 때만 맞으면 된다 */
export async function transcribe(ticket: SttTicket, file: { uri: string; mime: string }, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    const blob = await (await fetchImpl(file.uri)).blob();
    res = await fetchImpl(ticket.url, { method: 'POST', headers: { authorization: `Bearer ${ticket.token}`, 'content-type': file.mime }, body: blob });
  } catch {
    throw new SttError('network');
  }
  if (!res.ok) throw new SttError('stt_failed');
  const text = transcriptOf(await res.json().catch(() => null));
  if (!text) throw new SttError('empty');
  return text;
}
