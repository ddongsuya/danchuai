// 대화로 만든 요청서를 단추 요청서(단추 lib/rfq-schema.ts)로 옮긴다 (연동 4단계).
// 선택지 값은 단추가 받는 값과 글자까지 같아야 한다. 단추가 바꾸면 여기도 바꾼다.
// 회사명·연락처는 넣지 않는다. 단추가 계정 프로필에서 채운다.
// 분야별 칸(시험 종류·동물종·PK 군 구성 등)은 단추 양식(request_schema)을 받아 그 칸·선택지 글자 그대로 채운다.
// 양식을 못 받으면 예전처럼 분야만 보낸다(단추가 판 없는 요청으로 받는다).
import type { RequestSheet } from '@danchuai/core';

/** 단추 request_schema 의 칸 하나 (단추 lib/agent-request.ts SchemaField) */
export interface SchemaField {
  key: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  /** 같은 분야 칸(key)에 이 값 중 하나가 있으면 필수. 숫자가 들어가야 한다 */
  requiredIf?: { key: string; anyOf: string[] };
}

/** 단추 request_schema 응답 */
export interface RequestSchemaView {
  schemaVersion: string;
  fields: SchemaField[];
  categories: { name: string; fields: SchemaField[]; itemsKey: string | null }[];
}

/** 단추 request_check 응답(필요한 것만) */
export interface RequestCheckView {
  ok: boolean;
  outdated: boolean;
  issues: { key: string; label: string; code: string; message?: string }[];
  deliverable: boolean | null;
}

export type Details = Record<string, string | string[]>;

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
  /** 단추 양식 칸 값. 키는 단추 칸 그대로(`<분야>.<칸>`, 공통 칸은 칸 이름) */
  details?: Details;
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
export function fillFromChat(sheet: RequestSheet, texts: string[], schema?: RequestSchemaView | null): SendChoices {
  const t = [...texts, sheet.purpose ?? '', sheet.notes ?? '', sheet.glp ?? ''].join(' ');
  const purpose: SendChoices['purpose'] = /허가|IND|임상\s*신청|제출용|GLP/i.test(t) ? '허가자료 제출용' : /자체\s*연구|탐색|내부\s*검토/.test(t) ? '자체 연구용' : null;
  const intent: SendChoices['intent'] = /발주|진행\s*예정|바로\s*진행|계약\s*예정/.test(t) ? '발주 예정' : /예산/.test(t) ? '예산 검토' : /비교|여러\s*곳|견적\s*받/.test(t) ? '비교 견적' : null;
  const confid: SendChoices['confid'] = /자체\s*CDA|우리\s*CDA|회사\s*CDA/i.test(t) ? '자체 CDA 사용' : /CDA|NDA|비밀유지|기밀/i.test(t) ? 'CDA 필요 (단추 표준 CDA)' : '일반';
  const categories = guessCategories(sheet.testType);
  const out: SendChoices = { purpose, intent, confid, categories, replyBy: '', agreed: false };
  return schema ? { ...out, details: guessDetails(sheet, texts, categories, schema) } : out;
}

const squash = (s: string) => s.replace(/\s/g, '');
const has = (opts: readonly string[] | undefined, v: string | null | undefined): v is string => !!v && !!opts?.includes(v);
/** 선택지 중 kw 가 들어간 것이 하나뿐이면 그것. 여럿이면 짐작하지 않는다 */
const only = (opts: readonly string[] | undefined, kw: RegExp) => {
  const hit = (opts ?? []).filter((o) => kw.test(o));
  return hit.length === 1 ? hit[0] : null;
};

/** 시험 종류 칸에서 대화와 확실히 맞는 선택지만 */
export function guessItems(cat: string, text: string, opts: readonly string[] | undefined): string[] {
  const t = squash(text);
  const out = new Set<string>();
  const add = (v: string | null) => {
    if (has(opts, v)) out.add(v);
  };
  if (cat === '일반독성') {
    const w = /(\d+)주/.exec(t)?.[1] ?? (/90일/.test(t) ? '13' : /28일/.test(t) ? '4' : null);
    if (/단회|급성/.test(t)) add('단회(급성)투여독성');
    if (w && /DRF|용량결정|용량설정/i.test(t)) add(`용량결정(DRF) ${w}주`);
    if (w && (/반복/.test(t) || !/단회|급성|DRF|용량결정|용량설정/i.test(t))) add(`반복투여 ${w}주`);
  }
  if (cat === 'PK/TK/ADME·생체시료분석') {
    if (/PK|약동|약물동태/i.test(t)) add('PK(약물동태)');
    if (/TK|독성동태/i.test(t)) add('TK(독성동태)');
    if (/ADME/i.test(t)) add('ADME');
  }
  if (cat === '유전독성') {
    if (/Ames|복귀돌연변이/i.test(t)) add(only(opts, /Ames/));
    if (/소핵/.test(t)) add(only(opts, /소핵/));
    if (/염색체/.test(t)) add(only(opts, /염색체/));
  }
  return (opts ?? []).filter((o) => out.has(o));
}

/** 대화의 동물 종을 단추 동물종 선택지로 */
function speciesOf(v: string | null, opts: readonly string[] | undefined): string[] {
  const t = squash(v ?? '');
  const map: [RegExp, string][] = [
    [/누드/, '누드마우스'],
    [/(?<!누드)(마우스|mouse|생쥐)/i, '마우스'],
    [/랫드|래트|rat/i, '랫드'],
    [/기니피그|guinea/i, '기니피그'],
    [/토끼|rabbit/i, '토끼'],
    [/비글|dog|^개/i, '개(비글)'],
    [/미니피그|minipig/i, '미니피그'],
    [/원숭이|영장류|monkey|cyno/i, '원숭이(영장류)'],
  ];
  return map.filter(([re, o]) => re.test(t) && has(opts, o)).map(([, o]) => o);
}

/** 대화의 투여 경로를 단추 선택지로. 하나로 정해질 때만 */
function routeOf(v: string | null, opts: readonly string[] | undefined): string | null {
  const t = squash(v ?? '');
  const map: [RegExp, string][] = [
    // 약어는 대문자만(영어 낱말 속 글자와 섞이지 않게)
    [/경구|PO|[Oo]ral/, '경구(PO)'],
    [/지속주입|[Ii]nfusion/, '정맥 지속주입(Infusion)'],
    [/(?<!지속)정맥|IV/, '정맥(IV)'],
    [/피하|SC|[Ss]ubcut/, '피하(SC)'],
    [/근육|IM/, '근육(IM)'],
    [/복강|IP/, '복강(IP)'],
  ];
  const hit = map.filter(([re, o]) => re.test(t) && has(opts, o)).map(([, o]) => o);
  // "정맥 지속주입"은 정맥에도 걸린다. 정맥 말고 다른 경로가 같이 있으면 짐작하지 않는다
  if (hit.includes('정맥 지속주입(Infusion)')) return hit.every((o) => o === '정맥 지속주입(Infusion)' || o === '정맥(IV)') ? '정맥 지속주입(Infusion)' : null;
  return hit.length === 1 ? hit[0] : null;
}

/** "2군", "군당 3마리", "3마리씩" 처럼 대화에 숫자로 나온 군 구성 */
function groupsOf(text: string): { groupCount: string | null; perGroup: string | null } {
  const t = squash(text);
  // "IV 1군, PO 1군, 2군"처럼 여럿이면: "총 N군", 또는 나머지의 합과 같은 수. 그 밖에는 짐작하지 않는다
  const nums = [...t.matchAll(/(\d+)개?군(?!당)/g)].map((m) => Number(m[1]));
  const total = /총(\d+)개?군/.exec(t)?.[1];
  const sum = nums.find((x, i) => nums.length > 2 && x === nums.reduce((a, b, j) => (j === i ? a : a + b), 0));
  const g = total ?? (nums.length && nums.every((x) => x === nums[0]) ? String(nums[0]) : sum !== undefined ? String(sum) : null);
  const n = /군당(\d+)(마리|수|두)?/.exec(t)?.[1] ?? /(\d+)(마리|수|두)씩/.exec(t)?.[1] ?? null;
  return { groupCount: g, perGroup: n };
}

/** 고른 분야의 단추 칸을 대화에서 채운다. 선택지 글자와 같은 값만 넣는다 */
export function guessDetails(sheet: RequestSheet, texts: string[], categories: string[], schema: RequestSchemaView): Details {
  const all = [sheet.testType ?? '', sheet.duration ?? '', sheet.notes ?? '', ...texts].join(' ');
  const d: Details = {};
  const top = (k: string) => schema.fields.find((f) => f.key === k);
  const route = routeOf(sheet.route, top('route')?.options);
  if (route) d.route = route;
  for (const name of categories) {
    const cat = schema.categories.find((c) => c.name === name);
    if (!cat) continue;
    const f = (id: string) => cat.fields.find((x) => x.key === `${name}.${id}`);
    if (cat.itemsKey) {
      const items = guessItems(name, all, cat.fields.find((x) => x.key === cat.itemsKey)?.options);
      if (items.length) d[cat.itemsKey] = items;
    }
    const sp = speciesOf(sheet.species, f('species')?.options);
    if (sp.length) d[`${name}.species`] = sp;
    const glp = /non/i.test(sheet.glp ?? '') ? 'Non-GLP' : /GLP/i.test(sheet.glp ?? '') ? 'GLP' : null;
    if (has(f('glpLevel')?.options, glp)) d[`${name}.glpLevel`] = glp;
    if (has(f('tk')?.options, '포함') && /TK|독성동태/i.test(all)) d[`${name}.tk`] = '포함';
    const g = groupsOf(all);
    if (f('groupCount') && g.groupCount) d[`${name}.groupCount`] = g.groupCount;
    if (f('perGroup') && g.perGroup) d[`${name}.perGroup`] = g.perGroup;
  }
  return d;
}

/** 지금 필수인 분야 칸: 시험 종류, 조건부 필수(PK 동물 시험의 군 수·군당 마릿수) */
export function requiredDetails(c: SendChoices, schema: RequestSchemaView | null | undefined): SchemaField[] {
  if (!schema) return [];
  const d = c.details ?? {};
  const out: SchemaField[] = [];
  for (const name of c.categories) {
    const cat = schema.categories.find((x) => x.name === name);
    if (!cat) continue;
    const items = cat.itemsKey ? cat.fields.find((x) => x.key === cat.itemsKey) : null;
    if (items) out.push(items);
    for (const f of cat.fields) {
      if (!f.requiredIf) continue;
      const on = d[f.requiredIf.key];
      if ((Array.isArray(on) ? on : on ? [on] : []).some((v) => f.requiredIf!.anyOf.includes(v))) out.push(f);
    }
  }
  return out;
}

/** 칸이 채워졌는지. 조건부 필수 칸은 숫자가 있어야 한다 */
export function detailFilled(f: SchemaField, v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (!v || !v.trim()) return false;
  return f.requiredIf ? /\d/.test(v) : true;
}

/** 칸 값 보여 주기 */
export const showDetail = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v?.trim() ?? '') || null;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type Gap = ChoiceField | 'substance' | 'agreed' | { detail: SchemaField };

/** 아직 정해지지 않은 첫 항목. 없으면 null. 분야 칸은 양식을 받았을 때만 묻는다 */
export function nextMissing(sheet: RequestSheet, c: SendChoices, schema?: RequestSchemaView | null): Gap | null {
  if (!sheet.substance?.trim()) return 'substance';
  if (!c.categories.length) return 'categories';
  const d = c.details ?? {};
  const miss = requiredDetails(c, schema).find((f) => !detailFilled(f, d[f.key]));
  if (miss) return { detail: miss };
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

/** 고른 분야와 공통 칸 값만 남긴다(분야를 빼면 그 분야 칸도 뺀다). 양식에 없는 칸은 보내지 않는다 */
function detailsFor(c: SendChoices, schema: RequestSchemaView): Details {
  const known = new Set([...schema.fields.map((f) => f.key), ...schema.categories.filter((x) => c.categories.includes(x.name)).flatMap((x) => x.fields.map((f) => f.key))]);
  return Object.fromEntries(Object.entries(c.details ?? {}).filter(([k, v]) => known.has(k) && (Array.isArray(v) ? v.length > 0 : !!v.trim())));
}

/**
 * 단추 요청서 본문. 보낼 값 그대로이고, 확인 카드도 이 값으로 그린다.
 * 양식을 받았으면 단추 칸 값과 양식 판(schemaVersion)을 함께 보낸다. 단추가 판을 보고 같은 규칙으로 검사한다.
 */
export function buildPayload(sheet: RequestSheet, body: string, c: SendChoices, schema?: RequestSchemaView | null): Record<string, unknown> {
  const notes = [body.trim(), conditions(sheet)].filter(Boolean).join('\n\n');
  return {
    ...(schema ? detailsFor(c, schema) : {}),
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
    ...(schema ? { schemaVersion: schema.schemaVersion } : {}),
  };
}

/** 검사(request_check)에 보낼 본문. 양식 판은 따로 보낸다 */
export function checkBody(payload: Record<string, unknown>): { payload: Record<string, unknown>; schemaVersion?: string } {
  const { schemaVersion, ...rest } = payload;
  return typeof schemaVersion === 'string' ? { payload: rest, schemaVersion } : { payload: rest };
}
