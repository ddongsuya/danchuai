// 대화로 만든 요청서를 단추 요청서(단추 lib/rfq-schema.ts)로 옮긴다 (연동 4단계).
// 선택지 값은 단추가 받는 값과 글자까지 같아야 한다. 단추가 바꾸면 여기도 바꾼다.
// 회사명·연락처는 넣지 않는다. 단추가 계정 프로필에서 채운다.
import type { RequestSheet } from '@danchuai/core';

export const PURPOSES = ['허가자료 제출용', '자체 연구용', '기타'] as const;
export const INTENTS = ['발주 예정', '비교 견적', '예산 검토'] as const;
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

/** 동의 세 가지. 단추 요청서에서는 따로 받지만, 앱은 세 문서를 함께 보여 주고 한 번에 받는다 */
export const AGREEMENTS = [
  { id: 'agreePrivacy', label: '개인정보 수집·이용', href: '/privacy' },
  { id: 'agreeTerms', label: '이용약관', href: '/terms' },
  { id: 'agreeShare', label: '요청 내용 기관 제공', href: '/privacy' },
] as const;

/** 받는 곳은 정하지 않는다. 분야가 맞는 참여 기관 전부에게 보내고, 비교표는 참여한 기관 수만큼 (2026-11-17 사용자 결정) */
export const CRO_COUNT_ALL = '전체';

export interface SendChoices {
  purpose: (typeof PURPOSES)[number] | null;
  intent: (typeof INTENTS)[number] | null;
  confid: (typeof CONFIDS)[number] | null;
  categories: string[];
  /** YYYY-MM-DD. 비우면 단추가 7영업일 뒤로 정한다 */
  replyBy: string;
  agreed: boolean;
}

export type ChoiceField = 'purpose' | 'intent' | 'confid' | 'categories';

/** 시험 종류에서 단추 시험 항목을 고른다. 확실히 맞는 것만 */
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
  if (/반복|단회|일반독성/.test(t) || t === '독성') out.add('일반독성');
  return CATEGORIES.filter((c) => out.has(c));
}

/** 대화에서 요청서 값을 채운다. 대화에 근거가 있는 것만 채우고, 없으면 비워서 카드에서 묻는다 */
export function fillFromChat(sheet: RequestSheet, texts: string[]): SendChoices {
  const t = [...texts, sheet.purpose ?? '', sheet.notes ?? '', sheet.glp ?? ''].join(' ');
  const purpose: SendChoices['purpose'] = /허가|IND|임상\s*신청|제출용|GLP/i.test(t) ? '허가자료 제출용' : /자체\s*연구|탐색|내부\s*검토/.test(t) ? '자체 연구용' : null;
  const intent: SendChoices['intent'] = /발주|진행\s*예정|바로\s*진행|계약\s*예정/.test(t) ? '발주 예정' : /예산/.test(t) ? '예산 검토' : /비교|여러\s*곳|견적\s*받/.test(t) ? '비교 견적' : null;
  const confid: SendChoices['confid'] = /자체\s*CDA|우리\s*CDA|회사\s*CDA/i.test(t) ? '자체 CDA 사용' : /CDA|NDA|비밀유지|기밀/i.test(t) ? 'CDA 필요 (단추 표준 CDA)' : '일반';
  return { purpose, intent, confid, categories: guessCategories(sheet.testType), replyBy: '', agreed: false };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 아직 정해지지 않은 첫 항목. 없으면 null */
export function nextMissing(sheet: RequestSheet, c: SendChoices): ChoiceField | 'substance' | 'agreed' | null {
  if (!sheet.substance?.trim()) return 'substance';
  if (!c.categories.length) return 'categories';
  if (!c.purpose) return 'purpose';
  if (!c.intent) return 'intent';
  if (!c.confid) return 'confid';
  if (c.replyBy && !YMD.test(c.replyBy)) return null;
  if (!c.agreed) return 'agreed';
  return null;
}

export const FIELD_LABEL: Record<ChoiceField | 'substance', string> = {
  substance: '시험물질',
  categories: '시험 항목',
  purpose: '의뢰 목적',
  intent: '요청 성격',
  confid: '기밀 등급',
};

export const FIELD_OPTIONS: Record<ChoiceField, readonly string[]> = {
  categories: CATEGORIES,
  purpose: PURPOSES,
  intent: INTENTS,
  confid: CONFIDS,
};

/** 대화 요청서의 시험 조건을 단추 "추가로 알려 주실 내용"에 한 줄씩 */
function conditions(sheet: RequestSheet): string {
  const rows: [string, string | null][] = [
    ['물질 종류', sheet.modality],
    ['제출 목적', sheet.purpose],
    ['임상 계획', sheet.clinicalPlan],
    ['끝낸 시험', sheet.priorStudies],
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
    croCount: CRO_COUNT_ALL,
    confid: c.confid,
    ...(c.replyBy ? { replyBy: c.replyBy } : {}),
    notes,
    agreePrivacy: true,
    agreeTerms: true,
    agreeShare: true,
  };
}
