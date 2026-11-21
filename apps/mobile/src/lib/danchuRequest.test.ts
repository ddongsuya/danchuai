import { EMPTY_SHEET } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { buildPayload, checkBody, fillFromChat, guessCategories, guessItems, nextMissing, requiredDetails, type RequestSchemaView, type SendChoices } from './danchuRequest';

const sheet = { ...EMPTY_SHEET, testType: '독성', substance: 'DC-101', species: '랫드', route: '경구', duration: '4주', glp: 'GLP', dueDate: '미정' };
const full: SendChoices = { purpose: '허가자료 제출용', intent: '비교 견적', confid: '일반', categories: ['일반독성'], replyBy: '', agreed: true };

describe('단추 요청서로 옮기기', () => {
  it('시험 종류는 확실한 것만 고른다', () => {
    expect(guessCategories('독성')).toEqual(['일반독성']);
    expect(guessCategories('4주 반복투여 독성, TK 포함')).toEqual(['일반독성', 'PK/TK/ADME·생체시료분석']);
    expect(guessCategories('기타')).toEqual([]);
  });

  it('대화에 근거가 있는 값만 채우고, 동의는 채우지 않는다', () => {
    const c = fillFromChat({ ...sheet, glp: null }, ['랫드 4주 독성 견적 여러 곳에서 받아 보고 싶어요. IND 제출용이에요.']);
    expect(c).toMatchObject({ purpose: '허가자료 제출용', intent: '비교 견적', confid: '일반', categories: ['일반독성'], agreed: false });
    expect(fillFromChat({ ...sheet, glp: null }, ['견적 주세요']).purpose).toBeNull();
    expect(fillFromChat(sheet, ['CDA 먼저 맺고 싶어요']).confid).toBe('CDA 필요 (단추 표준 CDA)');
  });

  it('빈 값을 하나씩 묻고, 동의가 마지막이다', () => {
    expect(nextMissing(sheet, { ...full, purpose: null })).toBe('purpose');
    expect(nextMissing(sheet, { ...full, agreed: false })).toBe('agreed');
    expect(nextMissing(sheet, full)).toBeNull();
  });

  it('받을 견적 수는 묻지 않고 참여 기관 전체로 보낸다. 회사명·연락처는 없다', () => {
    const p = buildPayload(sheet, '4주 반복투여 견적 부탁해요.', full);
    expect(p.croCount).toBe('전체');
    expect(p).not.toHaveProperty('company');
    expect(p).not.toHaveProperty('email');
    expect(p).not.toHaveProperty('replyBy');
    expect(p.notes).toBe('4주 반복투여 견적 부탁해요.\n\n시험 종류: 독성\n동물 종: 랫드\n투여 경로: 경구\n투여 기간: 4주\nGLP: GLP');
  });
});

/** 단추 request_schema 에서 필요한 칸만 (단추 lib/rfq-schema.ts 와 글자 같게) */
const PK = 'PK/TK/ADME·생체시료분석';
const ANIMAL = ['PK(약물동태)', 'TK(독성동태)', 'ADME', '물질수지', '조직분포', '배설'];
const SPECIES = ['마우스', '랫드', '누드마우스', '기니피그', '토끼', '개(비글)', '미니피그', '원숭이(영장류)', '기타'];
const schema: RequestSchemaView = {
  schemaVersion: 'abc123def456',
  fields: [{ key: 'route', type: 'select', label: '시험 투여경로', required: false, options: ['경구(PO)', '정맥(IV)', '정맥 지속주입(Infusion)', '피하(SC)', '기타'] }],
  categories: [
    {
      name: '일반독성',
      itemsKey: '일반독성.items',
      fields: [
        { key: '일반독성.items', type: 'chips', label: '시험 종류', required: false, options: ['단회(급성)투여독성', '용량결정(DRF) 2주', '반복투여 2주', '반복투여 4주', '반복투여 13주'] },
        { key: '일반독성.species', type: 'chips', label: '동물종', required: false, options: SPECIES },
        { key: '일반독성.tk', type: 'radio', label: 'TK 병행', required: false, options: ['포함', '미포함', '미정'] },
        { key: '일반독성.glpLevel', type: 'radio', label: 'GLP 적용', required: false, options: ['GLP', 'Non-GLP', '미정'] },
      ],
    },
    {
      name: PK,
      itemsKey: `${PK}.items`,
      fields: [
        { key: `${PK}.items`, type: 'chips', label: '시험 종류', required: false, options: [...ANIMAL, 'CYP 억제'] },
        { key: `${PK}.species`, type: 'chips', label: '동물종', required: false, options: SPECIES },
        { key: `${PK}.groupCount`, type: 'text', label: '군 수', required: false, requiredIf: { key: `${PK}.items`, anyOf: ANIMAL } },
        { key: `${PK}.perGroup`, type: 'text', label: '군당 마릿수', required: false, requiredIf: { key: `${PK}.items`, anyOf: ANIMAL } },
      ],
    },
    { name: '국소내성', itemsKey: null, fields: [] },
  ],
};

describe('단추 양식 칸으로 채우기', () => {
  it('시험 종류는 선택지 글자와 맞는 것만', () => {
    expect(guessItems('일반독성', '랫드 4주 반복투여독성', schema.categories[0].fields[0].options)).toEqual(['반복투여 4주']);
    expect(guessItems('일반독성', '90일 독성', schema.categories[0].fields[0].options)).toEqual(['반복투여 13주']);
    expect(guessItems('일반독성', '2주 DRF', schema.categories[0].fields[0].options)).toEqual(['용량결정(DRF) 2주']);
    expect(guessItems('일반독성', '8주 반복', schema.categories[0].fields[0].options)).toEqual([]);
  });

  it('독성: 시험 종류·동물종·TK·GLP·경로를 채운다', () => {
    const c = fillFromChat(sheet, ['4주 반복투여 독성이고 TK도 같이 봐 주세요'], schema);
    expect(c.details).toEqual({ route: '경구(PO)', '일반독성.items': ['반복투여 4주'], '일반독성.species': ['랫드'], '일반독성.tk': '포함', '일반독성.glpLevel': 'GLP' });
    expect(nextMissing(sheet, { ...full, details: c.details }, schema)).toBeNull();
  });

  it('PK: 군 수·군당 마릿수를 대화에서 읽고, 없으면 묻는다', () => {
    const pk = { ...sheet, testType: '랫드 PK', route: 'IV, PO' };
    const c = fillFromChat(pk, ['IV 1군 PO 1군 해서 2군, 군당 3마리로요'], schema);
    expect(c.categories).toEqual([PK]);
    expect(c.details).toMatchObject({ [`${PK}.items`]: ['PK(약물동태)'], [`${PK}.species`]: ['랫드'], [`${PK}.groupCount`]: '2', [`${PK}.perGroup`]: '3' });
    expect(c.details).not.toHaveProperty('route');
    const none = fillFromChat(pk, ['랫드 PK 견적 주세요'], schema);
    const gap = nextMissing(pk, { ...full, categories: [PK], details: none.details }, schema);
    expect(gap).toMatchObject({ detail: { key: `${PK}.groupCount` } });
    expect(nextMissing(pk, { ...full, categories: [PK], details: { ...none.details, [`${PK}.groupCount`]: '2', [`${PK}.perGroup`]: '미정' } }, schema)).toMatchObject({ detail: { key: `${PK}.perGroup` } });
  });

  it('PK 체외 시험만이면 군 구성을 묻지 않는다', () => {
    const c: SendChoices = { ...full, categories: [PK], details: { [`${PK}.items`]: ['CYP 억제'] } };
    expect(requiredDetails(c, schema).map((f) => f.key)).toEqual([`${PK}.items`]);
    expect(nextMissing(sheet, c, schema)).toBeNull();
  });

  it('시험 종류가 비면 분야마다 묻는다. 시험 종류 칸이 없는 분야는 묻지 않는다', () => {
    expect(nextMissing(sheet, { ...full, details: {} }, schema)).toMatchObject({ detail: { key: '일반독성.items' } });
    expect(nextMissing(sheet, { ...full, categories: ['국소내성'], details: {} }, schema)).toBeNull();
  });

  it('보낼 본문: 고른 분야 칸과 양식 판만 싣고, 검사 본문은 판을 따로 둔다', () => {
    const c: SendChoices = { ...full, details: { route: '경구(PO)', '일반독성.items': ['반복투여 4주'], [`${PK}.items`]: ['PK(약물동태)'], 'x.unknown': 'a', '일반독성.species': [] } };
    const p = buildPayload(sheet, '본문', c, schema);
    expect(p).toMatchObject({ route: '경구(PO)', '일반독성.items': ['반복투여 4주'], schemaVersion: 'abc123def456', categories: ['일반독성'] });
    expect(p).not.toHaveProperty(`${PK}.items`);
    expect(p).not.toHaveProperty('x.unknown');
    expect(p).not.toHaveProperty('일반독성.species');
    const b = checkBody(p);
    expect(b.schemaVersion).toBe('abc123def456');
    expect(b.payload).not.toHaveProperty('schemaVersion');
  });

  it('양식이 없으면 예전처럼 분야만 보낸다', () => {
    const p = buildPayload(sheet, '본문', { ...full, details: { '일반독성.items': ['반복투여 4주'] } });
    expect(p).not.toHaveProperty('schemaVersion');
    expect(p).not.toHaveProperty('일반독성.items');
  });
});
