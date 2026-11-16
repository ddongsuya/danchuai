// 대화로 만든 요청서를 단추 요청서(단추 lib/rfq-schema.ts)로 옮긴다 (연동 4단계).
// 선택지 값은 단추가 받는 값과 글자까지 같아야 한다. 단추가 바꾸면 여기도 바꾼다.
// 회사명·연락처는 넣지 않는다. 단추가 계정 프로필에서 채운다.
import type { RequestSheet } from '@danchuai/core';

export const PURPOSES = ['허가자료 제출용', '자체 연구용', '기타'] as const;
export const INTENTS = ['발주 예정', '비교 견적', '예산 검토'] as const;
export const CRO_COUNTS = ['3곳', '5곳', '전체'] as const;
export const CONFIDS = ['일반', 'CDA 필요 (단추 표준 CDA)', '자체 CDA 사용'] as const;
export const CATEGORIES = [
  '일반독성',
  '발암성·종양원성',
  '유전독성',
  '생식발생독성',
  '항원성·면역독성',
  '국소독성',
  '국소내성',
  '안전성약리',
  '동물대체시험',
  '조제물분석',
  'PK/TK/ADME·생체시료분석',
  '효력시험(약효)',
  '환경유해성',
  '의료기기 생물학적 안전성',
  '기타(임상병리·조직병리 등)',
] as const;

/** 동의 세 가지. 문구는 단추 요청서와 같다 */
export const AGREEMENTS = [
  { id: 'agreePrivacy', label: '견적 요청 처리를 위한 개인정보 수집·이용 동의', href: '/privacy' },
  { id: 'agreeTerms', label: '이용약관 동의', href: '/terms' },
  { id: 'agreeShare', label: '요청 내용 기관 제공, 선정 기관에 회사명·연락처 제공 동의', href: '/privacy' },
] as const;
export type AgreementId = (typeof AGREEMENTS)[number]['id'];

export interface SendChoices {
  purpose: (typeof PURPOSES)[number] | null;
  intent: (typeof INTENTS)[number] | null;
  croCount: (typeof CRO_COUNTS)[number] | null;
  confid: (typeof CONFIDS)[number] | null;
  categories: string[];
  /** YYYY-MM-DD. 비우면 단추가 7영업일 뒤로 정한다 */
  replyBy: string;
  agreed: Record<AgreementId, boolean>;
}

export const EMPTY_CHOICES: SendChoices = {
  purpose: null,
  intent: null,
  croCount: null,
  confid: null,
  categories: [],
  replyBy: '',
  agreed: { agreePrivacy: false, agreeTerms: false, agreeShare: false },
};

/** 대화의 "시험 종류"에서 단추 시험 항목을 고른다. 확실히 맞는 것만, 나머지는 사람이 고른다 */
export function guessCategories(testType: string | null): string[] {
  const t = (testType ?? '').replace(/\s/g, '');
  if (!t) return [];
  const out = new Set<string>();
  if (/효력|약효|PD/i.test(t)) out.add('효력시험(약효)');
  if (/PK|TK|ADME|약동/i.test(t)) out.add('PK/TK/ADME·생체시료분석');
  if (/유전독성/.test(t)) out.add('유전독성');
  if (/생식|발생/.test(t)) out.add('생식발생독성');
  if (/안전성약리/.test(t)) out.add('안전성약리');
  if (/발암|종양/.test(t)) out.add('발암성·종양원성');
  if (/반복|단회|일반독성/.test(t) || (t === '독성')) out.add('일반독성');
  return CATEGORIES.filter((c) => out.has(c));
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 보내기 전에 빠진 것 하나. 없으면 null */
export function missing(sheet: RequestSheet, c: SendChoices): string | null {
  if (!sheet.substance?.trim()) return '시험물질';
  if (!c.purpose) return '의뢰 목적';
  if (!c.intent) return '요청 성격';
  if (!c.categories.length) return '시험 항목';
  if (!c.croCount) return '받을 견적 수';
  if (!c.confid) return '기밀 등급';
  if (c.replyBy && !YMD.test(c.replyBy)) return '회신 희망일';
  if (!AGREEMENTS.every((a) => c.agreed[a.id])) return '동의';
  return null;
}

/** 대화 요청서의 시험 조건을 단추 "추가로 알려 주실 내용"에 한 줄씩 */
function conditions(sheet: RequestSheet): string {
  const rows: [string, string | null][] = [
    ['시험 종류', sheet.testType],
    ['동물 종', sheet.species],
    ['투여 경로', sheet.route],
    ['투여 기간', sheet.duration],
    ['GLP', sheet.glp],
    ['회신 기한(대화)', sheet.dueDate],
    ['기타', sheet.notes],
  ];
  return rows
    .filter(([, v]) => v && v.trim() && v.trim() !== '미정')
    .map(([k, v]) => `${k}: ${v!.trim()}`)
    .join('\n');
}

/** 단추 요청서 본문. 보낼 값 그대로이고, 확인 카드도 이 값으로 그린다 */
export function buildPayload(sheet: RequestSheet, body: string, c: SendChoices): Record<string, unknown> {
  const notes = [body.trim(), conditions(sheet)].filter(Boolean).join('\n\n');
  return {
    substance: sheet.substance?.trim() ?? '',
    purpose: c.purpose,
    intent: c.intent,
    categories: c.categories,
    croCount: c.croCount,
    confid: c.confid,
    ...(c.replyBy ? { replyBy: c.replyBy } : {}),
    notes,
    agreePrivacy: true,
    agreeTerms: true,
    agreeShare: true,
  };
}

/** 확인 카드에 보여 줄 줄. 보낼 값에서 바로 만든다 */
export function summaryLines(p: Record<string, unknown>): [string, string][] {
  const s = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '');
  return [
    ['시험물질', s(p.substance)],
    ['시험 항목', s(p.categories)],
    ['의뢰 목적', s(p.purpose)],
    ['요청 성격', s(p.intent)],
    ['받을 견적 수', s(p.croCount)],
    ['기밀 등급', s(p.confid)],
    ['회신 희망일', s(p.replyBy) || '7영업일 뒤'],
  ];
}
