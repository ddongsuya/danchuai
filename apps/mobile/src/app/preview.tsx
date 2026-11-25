// 화면 미리보기. 예시 값만 쓰고 서버를 부르지 않는다. 로그인 없이 열린다(_layout).
// /preview 는 목록, /preview?view=<이름> 은 그 화면 하나. 실제 화면과 같은 컴포넌트를 그대로 쓴다.
// 예시 값은 진단 문서 시안과 같다(사용자 선택 2026-11-17 "시안대로": DC-2026-0142, 가·나·다·라 기관, 후보물질 A). 실제 회사·사람·연락처는 넣지 않는다.
import { applyQuotePatch, characterOf, type AgentCharacterId, quoteDraftFromBrief, SHEET_LABELS, type RequestSheet, type SheetField } from '@danchuai/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CaretRight, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountView } from '@/app/account/index';
import { CharacterView } from '@/app/account/character';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ConsentBody } from '@/components/auth/ConsentBody';
import { GateState, type GateKind } from '@/components/auth/GateState';
import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { DraftCard } from '@/components/chat/DraftCard';
import { AgentText, UserMessage } from '@/components/chat/Messages';
import { NotFound } from '@/components/chat/NotFound';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { AssistView } from '@/components/lab/AssistChat';
import { RequesterHomeView } from '@/components/agent/RequesterHome';
import { DrawerFrame, type DrawerItem } from '@/components/shell/Drawer';
import { SettingsBody } from '@/components/shell/SettingsSheet';
import { FullSheet } from '@/components/ui/Muse';
import { FeedView } from '@/app/(tabs)/feed';
import { IdeasView } from '@/app/(tabs)/ideas';
import { TodoView } from '@/app/(tabs)/todo';
import { LibraryView } from '@/app/(tabs)/library';
import { AgentProfileView } from '@/app/agent';
import { PermissionsView } from '@/app/account/permissions';
import { labIdeas, requesterIdeas } from '@/lib/ideas';
import { libraryRows } from '@/lib/library';
import { labWatch, requesterWatch } from '@/lib/todo';
import { ShellProvider, type TabKey } from '@/components/shell/ShellContext';
import { TabBarView } from '@/components/shell/TabBar';
import { RunsView } from '@/app/lab/runs';
import { SentView } from '@/app/sent';
import { AlertsView } from '@/app/alerts';
import { DanchuLabView } from '@/components/lab/DanchuLab';
import { DanchuQuoteReview } from '@/components/lab/DanchuQuoteReview';
import { DanchuApprovalCard } from '@/components/request/DanchuApprovalCard';
import { DanchuRequestView } from '@/components/request/DanchuRequest';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { ResultBlock } from '@/components/ui/ResultBlock';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { REMOTE_ERROR } from '@/hooks/useRemote';
import type { AgentQuestion } from '@/lib/chat';
import type { ContractView } from '@/lib/danchuContract';
import type { QnaView } from '@/lib/danchuQna';
import type { QuoteSubmitPreview } from '@/lib/danchuQuote';
import type { SendChoices } from '@/lib/danchuRequest';
import type { InboxItem } from '@/lib/inbox';
import type { DanchuCompare, DanchuLabItem, DanchuRequest } from '@/lib/marketClient';
import type { CroDetailView, RequesterDetailView } from '@/lib/danchuDetail';

/** 오늘에서 n일 뒤 날짜(YYYY-MM-DD, 기기 날짜). 기한 숫자가 늘 그럴듯하게 보이도록 */
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const REQ_FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '허용 전', match: ['waiting' as const] },
];
const LAB_FILTERS = [
  { label: '전체', match: null },
  { label: '할 일', match: ['new' as const, 'viewed' as const] },
  { label: '제출', match: ['sent' as const] },
  { label: '선정', match: ['selected' as const] },
];

const md = (n: number) => day(n).slice(5).replace('-', '.');
const REQ_ITEMS: InboxItem[] = [
  { id: 'DC-2026-0142', title: '랫드 4주 반복투여독성', sub: '비교표 열림', status: 'replied', when: md(0), icon: 'flask' },
  { id: 'c:demo', title: '복귀돌연변이시험', sub: '요청서 확인 전', status: 'waiting', when: md(-1), icon: 'dna' },
  { id: 'c:demo2', title: '비글견 단회투여독성', sub: '시험물질 묻는 중', status: 'drafting', when: md(-3), icon: 'flask' },
];
const LAB_ITEMS: InboxItem[] = [
  { id: 'DC-2026-0142', title: 'DC-2026-0142 반복투여독성', sub: '참여할지 정하기', status: 'new', when: '참여 결정', due: `참여 결정 ${md(3)}까지`, icon: 'flask' },
  { id: 'DC-2026-0139', title: 'DC-2026-0139 유전독성', sub: '선정 기다리는 중', status: 'sent', when: md(-2), icon: 'dna' },
];

const REQUEST: DanchuRequest = {
  no: 'DC-2026-0142',
  title: '랫드 4주 반복투여독성',
  categories: ['일반독성'],
  status: 'open',
  createdAt: `${day(-3)}T09:00:00+09:00`,
  joinBy: day(3),
  replyBy: day(9),
  sent: 12,
  joined: 4,
  submitted: 2,
  compareOpen: false,
  selected: false,
};
const WAITING: DanchuCompare = { open: false, joined: 4, submitted: 2, replyBy: day(9) };
const OPEN: DanchuCompare = {
  open: true,
  columns: [
    { lab: '가 기관', total: 48_500_000, weeks: 14, submittedAt: day(4), quoteId: 'q-demo-1', revision: 1, selectable: true, docPath: '/app/r/DC-2026-0142/q/q-demo-1/doc' },
    { lab: '나 기관', total: 51_200_000, weeks: 12, submittedAt: day(5), quoteId: 'q-demo-2', revision: 2, selectable: true },
    { lab: '다 기관', total: 49_800_000, weeks: 16, submittedAt: day(7), quoteId: 'q-demo-3', revision: 1, selectable: false },
  ],
};

const LAB_TODO: DanchuLabItem = {
  no: 'DC-2026-0142',
  title: '랫드 4주 반복투여독성',
  categories: '반복투여독성',
  client: null,
  clientHint: '의뢰자(선정 전 비공개)',
  group: 'decide',
  stage: '참여 결정',
  next: '참여할지 정하기',
  due: day(3),
  steps: [
    { label: '요청 받음', at: '', state: 'done' },
    { label: '참여 결정', at: '', state: 'now' },
    { label: '견적 제출', at: '', state: 'next' },
  ],
  money: [],
  // 단추 lib/request-policy.ts JOIN_CONSENT·CRO_TERMS_VERSION(2026-11-17) 그대로
  join: {
    terms: 'pilot-2026-12-11',
    consent:
      '이 요청에 참여합니다. 요청서 내용은 이 견적에만 쓰고 외부에 알리지 않습니다. 견적을 제출하면 기관 이용약관의 요금표에 따라 청구 대상이 됩니다(2027년 12월 31일까지 참여한 요청은 무료). 제출 전에는 언제든 철회할 수 있고, 철회하면 청구하지 않습니다.',
    termsUrl: '/terms/cro',
  },
};
// 견적 확인(말로 맡기는 견적 2단계). 단추가 주는 모양 그대로의 예시 값만, 실제 기관·의뢰자 값 없음
const QUOTE = applyQuotePatch(
  quoteDraftFromBrief({
    no: 'DC-2026-0142',
    state: 'open',
    closedReason: null,
    request: {
      full: true, substance: '후보물질 A', categories: ['반복투여독성'], overview: [], common: [], situation: [], ask: [], replyBy: day(9), authorities: [], translation: false, files: [],
      rows: [
        { seq: 1, category: '반복투여독성', name: '랫드 4주 반복투여독성', cond: '경구' },
        { seq: 2, category: '반복투여독성', name: 'TK 분석', cond: '' },
        { seq: 3, category: '반복투여독성', name: '회복군 추가(4주)', cond: '' },
        { seq: 4, category: '국소독성', name: '미니피그 피부자극', cond: '' },
      ],
    },
    draft: {
      status: 'draft', prefilled: true, note: '', steps: [], pdfName: '',
      common: { validUntil: '', startDate: '', payTerms: '', substanceQty: '', reportLang: '', includes: [] },
      items: [
        { seq: 1, avail: '가능', amount: '48500000', weeks: '14', source: 'catalog' },
        { seq: 2, avail: '가능', amount: '6200000', weeks: '6', source: 'catalog' },
      ],
    },
  }),
  {
    items: [
      { seq: 3, avail: '조건부 가능', weeks: '4', reason: '추가 단가 없음' },
      { seq: 4, avail: '불가', reason: '시험 목록에 없음' },
    ],
    common: { startDate: day(21), validUntil: day(60), payTerms: '30, 40, 30' },
  },
).draft;

// 단추 제출 미리보기(quote_submit_preview) 모양 그대로의 예시 값. 금액은 계산 확인용 가상의 값
const QUOTE_DOC: QuoteSubmitPreview = {
  docId: 'doc-preview', docNo: 'Q-2026-0142', updatedAt: '2026-11-20T09:00:00Z', path: '/cro/docs/doc-preview/fill', discount: 0, mismatched: [], unlinked: [],
  rows: [
    { seq: 1, amount: 48_500_000, weeks: 14, extra: { exp_groups: '대조 1군, 시험 3군(군당 암수 각 10)', exp_why: '임상 4주 투여에 맞춘 기간' }, tests: [{ uid: 't1', title: '랫드 4주 반복투여독성', total: 48_500_000, manual: false }] },
    { seq: 2, amount: 6_200_000, weeks: 6, extra: { exp_samples: '시험 3군 6마리 × 8시점 = 144검체' }, tests: [{ uid: 't2', title: 'TK 분석', total: 6_200_000, manual: false }] },
    { seq: 3, amount: null, weeks: 4, extra: {}, tests: [{ uid: 't3', title: '회복군 추가(4주)', total: 0, manual: true }] },
    { seq: 4, amount: null, weeks: null, extra: {}, tests: [] },
  ],
};
const QUOTE_DOC_READY: QuoteSubmitPreview = { ...QUOTE_DOC, rows: QUOTE_DOC.rows.map((r) => (r.seq === 3 ? { ...r, amount: 32_000_000, tests: [{ ...r.tests[0]!, total: 32_000_000 }] } : r)) };
// 할인 300만 원을 줄 금액 비율로 나눈 값(단추 spreadDiscount 와 같은 결과)
const QUOTE_DOC_DISCOUNT: QuoteSubmitPreview = {
  ...QUOTE_DOC_READY,
  discount: 3_000_000,
  unlinked: ['조직병리 추가 판독'],
  rows: QUOTE_DOC_READY.rows.map((r) => (r.seq === 1 ? { ...r, amount: 46_821_799 } : r.seq === 2 ? { ...r, amount: 5_985_468 } : r.seq === 3 ? { ...r, amount: 30_892_733 } : r)),
};

const LAB_WORK: DanchuLabItem = {
  ...LAB_TODO,
  join: null,
  group: 'work',
  stage: '참여',
  next: '견적 쓰기',
  steps: [
    { label: '요청 받음', at: '', state: 'done' },
    { label: '참여', at: '', state: 'done' },
    { label: '견적 제출', at: '', state: 'now' },
  ],
};

const LAB_SENT: DanchuLabItem = {
  ...LAB_TODO,
  join: null,
  no: 'DC-2026-0139',
  title: '마우스 유전독성',
  categories: '유전독성',
  group: 'sent',
  stage: '견적 제출',
  next: '선정 기다리는 중',
  due: day(2),
  steps: [
    { label: '요청 받음', at: '', state: 'done' },
    { label: '견적 제출', at: '', state: 'done' },
    { label: '선정 결과', at: '', state: 'now' },
  ],
  money: [['제출 금액', '12,100,000원']],
};

const SHEET: RequestSheet = {
  modality: null,
  purpose: null,
  clinicalPlan: null,
  priorStudies: null,
  testType: '4주 반복투여 독성',
  substance: '후보물질 A',
  species: '랫드',
  route: '경구',
  duration: '4주, 회복 2주',
  glp: 'GLP',
  dueDate: null,
  notes: null,
};
const BODY = '시험물질 후보물질 A를 랫드에 4주간 경구 투여하고 2주 회복군을 두는 반복투여독성시험 견적을 요청해요. 시험물질은 1주 안에 보낼 수 있어요.';
/** 새 요청 대화 앞부분(시안 A07·A08과 같은 문장) */
const CHAT_HEAD = (
  <>
    <AgentText>어떤 시험 견적을 받아 드릴까요?</AgentText>
    <UserMessage text="랫드 4주 반복투여독성, 회복군 포함이요" />
  </>
);
const CHAT_FILLED = <AgentText>다 됐어요. 요청서를 채웠어요. 보내기 전에 한 번만 봐 주세요</AgentText>;

// 질문 카드 예시(시안 danchuai-question-card). 근거 원문 조각은 지식 검색 결과 그대로(ICH M3 5.1, 앞 220자).
const IND_HEAD = (
  <>
    <UserMessage text="IND 제출 목적으로 합성의약품 독성시험 견적 받고 싶어요" />
    <AgentText>합성의약품 IND라고 하셨으니 물질 종류와 제출 목적은 그 말대로 채울게요. ICH M3 기준으로 반복투여독성 기간은 임상 투여기간에 맞춰 정해져요. 2주 이내 임상은 2주, 2주~6개월 임상은 임상 기간과 같은 기간이 기본이에요. 그래서 임상 기간부터 확인할게요.</AgentText>
  </>
);
const M3_51 = {
  doc: 'ICH M3',
  name: 'ICH M3(R2) 임상시험 및 품목허가를 위한 비임상 안전성시험',
  section: '5.1 Clinical Development Trials',
  url: 'https://database.ich.org/sites/default/files/M3_R2__Guideline.pdf',
  version: 'Step 4, 11 June 2009',
  excerpt:
    'Repeated-dose toxicity studies in two species (one non-rodent) for a minimum duration of 2 weeks (Table 1) would generally support any clinical development trial up to 2 weeks in duration. Clinical trials of longer durat…',
};
const Q_CLINICAL: AgentQuestion = {
  field: 'clinicalPlan',
  question: '계획 중인 임상시험의 최대 투여 기간은요?',
  options: [
    { label: '2주 이내', effect: '반복투여독성 2주' },
    { label: '1개월 이내', effect: '반복투여독성 4주' },
    { label: '3개월 이내', effect: '반복투여독성 13주' },
    { label: '6개월 이내', effect: '반복투여독성 26주' },
  ],
  basis: [M3_51],
};
const Q_PRIOR: AgentQuestion = {
  field: 'priorStudies',
  question: '이미 끝낸 비임상 시험이 있나요?',
  options: [
    { label: '아직 없음', effect: '처음부터 전부 견적' },
    { label: '용량결정(DRF)만', effect: '본시험부터 견적' },
    { label: '단회·유전독성 일부', effect: '남은 시험만 견적' },
  ],
};
const Q_RECHECK: AgentQuestion = {
  field: 'duration',
  question: '임상 3개월 계획에 맞춰 기간을 어떻게 할까요?',
  options: [
    { label: '4주 그대로', effect: '임상 1개월까지 해당' },
    { label: '13주로 바꾸기', effect: '임상 3개월까지 해당' },
    { label: '4주·13주 둘 다', effect: '두 안을 함께 견적' },
  ],
  basis: [M3_51],
  recheck: true,
};
const qCard = (q: AgentQuestion, left: string, initial?: Parameters<typeof QuestionCard>[0]['initial']) => (
  <QuestionCard question={q} field={SHEET_LABELS[q.field as SheetField]} left={left} initial={initial} onAnswer={() => router.push(toView('q-next'))} />
);
// 계약 진행 예시(가상의 값)
const CONTRACT_BASE: ContractView = {
  lab: '가 기관', awardedAt: day(-6), quoteAmount: 50_000_000, state: 'awaiting_report', report: null, gap: null,
  confirmDueAt: null, confirmedAt: null, confirmedVia: null, sponsor: null, sponsorSaysSigned: false,
  can: { report: true, correct: false, confirm: false, tellResult: false },
  gapRule: { ratio: 0.1, reasons: [{ id: 'scope', label: '시험 범위 변경' }, { id: 'price', label: '단가·할인 조정' }, { id: 'schedule', label: '일정 변경' }, { id: 'other', label: '기타' }] },
};
const CONTRACT_TO_CONFIRM: ContractView = {
  ...CONTRACT_BASE, state: 'to_confirm', report: { date: day(-1), amount: 44_000_000, gapReason: 'scope', gapReasonLabel: '시험 범위 변경', note: '회복군 제외', reportedAt: day(-1) },
  gap: { diff: -6_000_000, ratio: -0.12 }, confirmDueAt: day(6), can: { report: false, correct: false, confirm: true, tellResult: false },
};
// 질의응답 예시(가상의 값)
const QNA_TOPICS = [{ id: 'terms', label: '요청 조건' }, { id: 'substance', label: '시험물질' }, { id: 'schedule', label: '일정' }, { id: 'quote', label: '견적' }, { id: 'other', label: '기타' }];
const QNA_REQ: QnaView = {
  topics: QNA_TOPICS,
  qna: {
    items: [
      { id: 'q2', direction: 'cro', topic: '시험물질', test: null, body: '시험물질 보유량이 얼마나 되나요?', bodyMasked: false, at: day(-1), answer: null, answerMasked: false, answeredAt: null, scope: null, party: '나 기관', inviteId: 'i2', toAnswer: true },
      { id: 'q1', direction: 'sponsor', topic: '견적', test: '반복투여 4주', body: '회복군을 빼면 금액이 얼마나 줄어요?', bodyMasked: false, at: day(-2), answer: '약 600만 원 줄어요.', answerMasked: false, answeredAt: day(-1), scope: null, party: '가 기관', inviteId: 'i1', toAnswer: false },
    ],
    targets: [{ inviteId: 'i1', label: '가 기관' }, { inviteId: 'i2', label: '나 기관' }],
    canAsk: true, canAnswer: true, pending: 1, replyBy: day(3), tests: [{ seq: 1, name: '반복투여 4주' }],
  },
};
const QNA_LAB: QnaView = {
  topics: QNA_TOPICS,
  qna: {
    mine: [{ id: 'q3', direction: 'sponsor', topic: '일정', test: null, body: '착수를 12월 둘째 주로 맞출 수 있나요?', bodyMasked: false, at: day(-1), answer: null, answerMasked: false, answeredAt: null, scope: null, party: '', inviteId: 'i1', toAnswer: true }],
    shared: [],
    canAsk: true, canAnswer: true, pending: 1, replyBy: day(3), tests: [{ seq: 1, name: '반복투여 4주' }],
  },
};
// 2차 상세 요청 예시(가상의 값)
const DETAIL_REQ: RequesterDetailView = {
  canSend: true,
  maxTargets: 3,
  targets: [{ quoteId: 'qa', lab: '가 기관' }, { quoteId: 'qb', lab: '나 기관' }, { quoteId: 'qc', lab: '다 기관' }],
  fields: [
    { key: 'tox.recovery', group: '독성', label: '회복군', type: 'select', options: ['있음', '없음'], current: '있음', private: false },
    { key: 'tox.species', group: '독성', label: '동물종', type: 'chips', options: ['랫드', '마우스', '비글견'], current: '랫드', private: false },
    { key: 'common.report', group: '공통', label: '보고서 언어', type: 'select', options: ['국문', '영문', '국문+영문'], current: '국문', private: false },
  ],
  sent: null,
};
const DETAIL_REQ_SENT: RequesterDetailView = {
  ...DETAIL_REQ,
  canSend: false,
  sent: {
    replyBy: day(5),
    note: '회복군 없이 다시 받아 보고 싶어요.',
    changed: [{ key: 'tox.recovery', label: '회복군', group: '독성', was: '있음', now: '없음' }],
    added: [],
    targets: [
      { quoteId: 'qa', lab: '가 기관', status: 'submitted', statusLabel: '2차 견적 보냄', total: 80_300_000, weeks: 14, respondedAt: day(-1) },
      { quoteId: 'qb', lab: '나 기관', status: 'sent', statusLabel: '회신할 차례', total: null, weeks: null, respondedAt: null },
    ],
  },
};
const DETAIL_LAB: CroDetailView = {
  status: 'sent',
  replyBy: day(5),
  expired: false,
  closed: false,
  changed: [{ key: 'tox.recovery', label: '회복군', group: '독성', was: '있음', now: '없음' }],
  added: [],
  first: { total: 86_200_000, weeks: 16, items: [{ seq: 1, name: '반복투여 4주', amount: 86_200_000, weeks: 16, avail: 'ok' }] },
  reply: null,
  canReply: true,
};
const CHOICES: SendChoices = { purpose: null, intent: '비교 견적', confid: '일반', categories: ['일반독성'], replyBy: '', agreed: false };

// 기관 비서 예시(가상의 고객사·담당자)
const ASSIST_BRIEF = {
  date: day(0),
  today: [
    { kind: 'task' as const, time: null, title: '견적서 보완', sub: '가 제약, 랫드 4주 반복투여독성', done: false, overdue: true, badge: 'D+1' },
    { kind: 'event' as const, time: '14:00', title: '나 바이오 화상 미팅', sub: '효력시험 설계 협의', done: false, overdue: false, badge: '' },
    { kind: 'danchu' as const, time: null, title: 'DC-2026-0142 회신 기한', sub: '반복투여독성, 기한 내일', done: false, overdue: false, badge: 'D-1' },
  ],
  need: [
    { dealId: 'd2', title: '유전독성 3종', company: '다 바이오텍', reason: '견적 유효기간 D-3', tone: 'due' as const, suggest: '안건 열기' },
    { dealId: 'd3', title: '랫드 PK', company: '라 제약', reason: '다음 할 일 없음', tone: 'warn' as const, suggest: '할 일 잡기' },
  ],
};
// 과거 견적 찾기(가상의 견적서, 금액은 계산 확인용 가상의 값)
const FIND_MESSAGES = [
  { id: 'u1', role: 'user' as const, text: '작년 28일 랫드 경구 견적 찾아줘' },
  { id: 'a1', role: 'agent' as const, text: '28일 랫드 경구 견적서를 찾아볼게요.' },
];
const FIND_LOOKUPS = [{ key: 'l0', at: 1, action: 'quote_history', label: '과거 견적 찾기', body: { q: '28일 랫드 경구' } }];
const FIND_HITS = [
  { id: 'd1', docNo: 'Q-2609-007', title: '반복투여독성 28일 (랫드, 경구)', client: '단추 요청 DC-2026-0098', substance: '후보물질 B', rfqNo: 'DC-2026-0098', issuedOn: '2026-09-12', supply: 86_400_000, tests: [{ name: '반복투여독성 28일', total: 71_400_000 }, { name: '조제물분석', total: 15_000_000 }] },
  { id: 'd2', docNo: 'Q-2603-002', title: '반복투여독성 28일 (랫드, 경구)', client: '', substance: '후보물질 A', rfqNo: null, issuedOn: '2026-03-04', supply: 68_000_000, tests: [{ name: '반복투여독성 28일', total: 68_000_000 }] },
];

const ASSIST_MESSAGES = [
  { id: 'u1', role: 'user' as const, text: '다 바이오텍 다음 주 화요일에 후속 연락 잡고, 라 제약 PK는 협의로 옮겨 줘' },
  { id: 'a1', role: 'agent' as const, text: '다 바이오텍 후속 연락을 11월 25일 할 일로 잡고, 라 제약 랫드 PK는 협의 단계로 옮겨 둘게요. 바로 하는 기록이라 되돌리기를 누르면 원래대로 돌아가요' },
];
const ASSIST_ACTIONS = [
  { key: 'x0', at: 1, label: '할 일 만들기', outcome: 'done' as const, message: null, runId: 'r1', undoable: true, undone: false },
  { key: 'x1', at: 1, label: '안건 단계 옮기기', outcome: 'done' as const, message: null, runId: 'r2', undoable: false, undone: true },
];

const ASSIST_RUNS = [
  { id: 'r1', action: 'task_create', label: '할 일 만들기', outcome: 'done' as const, undoable: true, undone: false, createdAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: 'r2', action: 'deal_move', label: '안건 단계 옮기기', outcome: 'done' as const, undoable: false, undone: true, createdAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: 'r3', action: 'event_create', label: '일정 잡기', outcome: 'failed' as const, undoable: false, undone: false, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const SENT_CRO = [
  { id: 's1', action: 'contract_report', rfqNo: 'DC-2026-0142', status: 'unknown' as const, at: ago(8), mine: true, reason: null },
  { id: 's2', action: 'detail_reply', rfqNo: 'DC-2026-0138', status: 'failed' as const, at: ago(95), mine: false, reason: '회신 기한이 지났어요.' },
  { id: 's3', action: 'quote_submit', rfqNo: 'DC-2026-0131', status: 'sent' as const, at: ago(60 * 26), mine: true, reason: null },
  { id: 's4', action: 'join', rfqNo: 'DC-2026-0131', status: 'sent' as const, at: ago(60 * 50), mine: true, reason: null },
];
const SENT_REQ = [
  { id: 'q1', action: 'select', rfqNo: 'DC-2026-0120', status: 'sent' as const, at: ago(30), mine: true, reason: null },
  { id: 'q2', action: 'ask', rfqNo: 'DC-2026-0120', status: 'sent' as const, at: ago(60 * 20), mine: true, reason: null },
  { id: 'q3', action: 'create', rfqNo: 'DC-2026-0120', status: 'sent' as const, at: ago(60 * 72), mine: true, reason: null },
];

const ALERTS_CRO = [
  { id: 'n1', kind: '선정', title: 'DC-2026-0142 요청에서 선정되었어요', body: '계약서(안)을 보내고 계약 체결을 보고해 주세요.', href: '/cro/quotes/DC-2026-0142', read: false, at: ago(12) },
  { id: 'n2', kind: '견적', title: '2차 상세 요청이 왔어요', body: 'DC-2026-0138, 회복군 조건이 바뀌었어요. 회신 기한 11.28', href: '/cro/quotes/DC-2026-0138', read: false, at: ago(70) },
  { id: 'n3', kind: '견적', title: '의뢰자 질의가 왔어요', body: 'DC-2026-0131, 시험물질 조제 방법', href: '/cro/quotes/DC-2026-0131', read: true, at: ago(60 * 26) },
];
const ALERTS_REQ = [
  { id: 'm1', kind: '견적', title: '견적이 도착했어요', body: 'DC-2026-0120, 3곳 중 2곳 회신', href: '/app/r/DC-2026-0120', read: false, at: ago(20) },
  { id: 'm2', kind: '계약', title: '기관이 계약 체결을 보고했어요', body: '확인 기한 11.30', href: '/app/r/DC-2026-0118', read: true, at: ago(60 * 30) },
];

// 시안 원본 대조용(m02·m04·m05·m07·m08·m10·m15). 문장은 시안 원본 그대로, 회사명은 가상의 예시(다 바이오텍)만
const M02_MESSAGES = [
  { id: 'u1', role: 'user' as const, text: '0142 회신 기한 언제야?' },
  { id: 'a1', role: 'agent' as const, text: '11월 27일(목)까지예요. 견적서에 금액 1줄이 비어 있는데, 지금 채워 둘까요?' },
];
const M15_MESSAGES = [
  { id: 'u1', role: 'user' as const, text: '0147 참여할지 정리해 줘' },
  { id: 'a1', role: 'agent' as const, text: '복귀돌연변이시험 5개 균주, GLP예요. 시험 목록에 같은 조합이 있어요. 참여 의사를 보낼까요?' },
];
const ALERTS_M04 = [
  { id: 'p1', kind: '접수', title: 'DC-2026-0151 새 요청이 왔어요', body: '복귀돌연변이시험(OECD 471), 5개 균주, GLP. 참여 기한은 11월 28일이에요.', href: '/cro/quotes/DC-2026-0151', read: false, at: ago(12) },
  { id: 'p2', kind: '견적', title: '견적 유효기간이 3일 남았어요', body: 'DC-2026-0139 유전독성 3종 견적이 11월 28일에 끝나요. 아직 회신이 없어요.', href: '/cro/quotes/DC-2026-0139', read: false, at: ago(60) },
  { id: 'p3', kind: '선정', title: 'DC-2026-0131 선정됐어요', body: '비글견 4주 반복투여독성. 계약서(안)을 보내면 의뢰자 회사명이 열려요.', href: null, read: true, at: ago(60 * 3) },
];
const labRow = (no: string, group: DanchuLabItem['group'], next: string, stage: string, due: string | null): DanchuLabItem => ({ ...LAB_SENT, no, group, next, stage, due });
const LAB_LIST: DanchuLabItem[] = [
  labRow('DC-2026-0142', 'work', '회신 기한', '견적 작성 중', '2026-11-27'),
  labRow('DC-2026-0139', 'todo', '견적 유효기간', '회신 기다리는 중', '2026-11-28'),
  labRow('DC-2026-0131', 'won', '계약 체결 보고', '선정', '2026-12-03'),
];
const ASSIST_RUNS_M = [
  { id: 'm1', action: 'quote_doc', label: '견적서 만들기', outcome: 'done' as const, undoable: true, undone: false, createdAt: ago(40) },
  { id: 'm2', action: 'task_create', label: '할 일 만들기', outcome: 'done' as const, undoable: true, undone: false, createdAt: ago(60 * 4) },
  { id: 'm3', action: 'crm_activity', label: '미팅 기록 넣기', outcome: 'done' as const, undoable: true, undone: false, createdAt: ago(60 * 4 + 2) },
  { id: 'm4', action: 'event_create', label: '일정 만들기', outcome: 'failed' as const, undoable: false, undone: false, createdAt: ago(60 * 5 + 30) },
];

const reqHome = (recent: Parameters<typeof RequesterHomeView>[0]['recent'], drawer = false) => (
  <InTabs role="requester" tab="index" drawer={drawer}>
    <RequesterHomeView recent={recent} onRetry={noop} onStart={() => router.push(toView('chat'))} onAsk={noop} onOpen={() => router.push(toView('compare'))} onAll={() => router.push(toView('tab-todo-req'))} />
  </InTabs>
);

type View_ = { key: string; label: string; group: string };
const VIEWS: View_[] = [
  { key: 'm02', label: 'm02 대화(기관), 브리핑 카드', group: '시안 원본 대조' },
  { key: 'm03', label: 'm03 확인 카드(견적 제출)', group: '시안 원본 대조' },
  { key: 'm04', label: 'm04 소식(기관)', group: '시안 원본 대조' },
  { key: 'm05', label: 'm05 맡길 일', group: '시안 원본 대조' },
  { key: 'm06', label: 'm06 맡길 일 시트', group: '시안 원본 대조' },
  { key: 'm07', label: 'm07 할 일(지켜보는 중·목표)', group: '시안 원본 대조' },
  { key: 'm08', label: 'm08 자료(결과물)', group: '시안 원본 대조' },
  { key: 'm09', label: 'm09 서랍', group: '시안 원본 대조' },
  { key: 'm10', label: 'm10 비서 활동', group: '시안 원본 대조' },
  { key: 'm11', label: 'm11 비서 확인', group: '시안 원본 대조' },
  { key: 'm12', label: 'm12 설정 시트', group: '시안 원본 대조' },
  { key: 'm13', label: 'm13 권한', group: '시안 원본 대조' },
  { key: 'm14', label: 'm14 비서 캐릭터(비비 고름)', group: '시안 원본 대조' },
  { key: 'm15', label: 'm15 비비로 바꾼 뒤 대화', group: '시안 원본 대조' },
  { key: 'm03-req', label: '확인 카드(의뢰자 요청 보내기)', group: '시안 원본 대조' },
  { key: 'lab-assist-ask', label: '비서, 매번 묻기 확인 카드', group: '시안 원본 대조' },
  { key: 'req-home', label: '의뢰자 첫 화면, 최근 요청', group: '첫 화면' },
  { key: 'req-home-new', label: '의뢰자 첫 화면, 요청 없음', group: '첫 화면' },
  { key: 'req-home-loading', label: '의뢰자 첫 화면, 불러오는 중', group: '첫 화면' },
  { key: 'req-home-menu', label: '의뢰자 대화 탭, 서랍 열림', group: '첫 화면' },
  { key: 'tab-feed-req', label: '소식 탭(의뢰자)', group: '탭' },
  { key: 'character', label: '비서 캐릭터 고르기(비비 고름)', group: '탭' },
  { key: 'lab-assist-bibi', label: '비서를 비비로 바꾼 뒤 대화', group: '탭' },
  { key: 'tab-feed-lab', label: '소식 탭(기관)', group: '탭' },
  { key: 'tab-todo-req', label: '할 일 탭(의뢰자 요청함)', group: '탭' },
  { key: 'tab-todo-lab', label: '할 일 탭(기관 받은 요청)', group: '탭' },
  { key: 'tab-ideas-req', label: '맡길 일 탭(의뢰자)', group: '탭' },
  { key: 'tab-library-req', label: '자료 탭(의뢰자)', group: '탭' },
  { key: 'inbox', label: '요청함(의뢰자)', group: '요청함' },
  { key: 'inbox-lab', label: '요청함(기관)', group: '요청함' },
  { key: 'inbox-empty', label: '요청함, 요청 없음', group: '요청함' },
  { key: 'inbox-error', label: '요청함, 불러오기 실패', group: '요청함' },
  { key: 'chat', label: '새 요청 대화, 질문 카드', group: '새 요청' },
  { key: 'q-press', label: '질문 카드, 고른 순간', group: '새 요청' },
  { key: 'q-next', label: '질문 카드, 다음 질문', group: '새 요청' },
  { key: 'q-recheck', label: '질문 카드, 어긋난 칸 다시 묻기', group: '새 요청' },
  { key: 'q-type', label: '질문 카드, 직접 입력', group: '새 요청' },
  { key: 'q-sheet', label: '질문 카드, 근거 원문', group: '새 요청' },
  { key: 'q-fold', label: '질문 카드, 접힘', group: '새 요청' },
  { key: 'draft', label: '요청 본문 초안', group: '새 요청' },
  { key: 'approve', label: '요청서 확인(승인 카드)', group: '새 요청' },
  { key: 'approve-sending', label: '요청서 확인, 요청하는 중', group: '새 요청' },
  { key: 'done', label: '요청 완료', group: '새 요청' },
  { key: 'request', label: '진행, 회신 받는 중', group: '진행·비교' },
  { key: 'compare', label: '진행, 비교표 열림', group: '진행·비교' },
  { key: 'select', label: '기관 선정 시트', group: '진행·비교' },
  { key: 'selected', label: '진행, 선정 뒤', group: '진행·비교' },
  { key: 'contract-req', label: '선정 뒤, 기관 계약 보고 확인', group: '진행·비교' },
  { key: 'qna-req', label: '비교표 열림, 질의응답', group: '진행·비교' },
  { key: 'detail-req', label: '비교표 열림, 2차 상세 요청', group: '진행·비교' },
  { key: 'detail-req-sent', label: '2차 상세 요청 보낸 뒤', group: '진행·비교' },
  { key: 'lab', label: '받은 요청, 할 일 있음', group: '기관' },
  { key: 'lab-join', label: '받은 요청, 참여하기 시트', group: '기관' },
  { key: 'lab-decline', label: '받은 요청, 불참 시트', group: '기관' },
  { key: 'lab-work', label: '받은 요청, 참여 뒤(AI 견적)', group: '기관' },
  { key: 'lab-quote', label: '견적 확인, 금액 넣기 남음', group: '기관' },
  { key: 'lab-quote-ready', label: '견적 확인, 제출 가능', group: '기관' },
  { key: 'lab-quote-calc', label: '견적 확인, 할인·제출 제외', group: '기관' },
  { key: 'lab-sent', label: '받은 요청, 제출 뒤', group: '기관' },
  { key: 'lab-won', label: '받은 요청, 선정·계약서(안)', group: '기관' },
  { key: 'lab-contract', label: '받은 요청, 계약 체결 보고 전', group: '기관' },
  { key: 'lab-qna', label: '받은 요청, 의뢰자 질의에 답할 차례', group: '기관' },
  { key: 'lab-detail', label: '받은 요청, 2차 회신할 차례', group: '기관' },
  { key: 'lab-assist', label: '비서 홈(기관 첫 화면), 오늘 브리핑', group: '기관' },
  { key: 'lab-assist-typing', label: '비서, 생각하는 중(점 셋)', group: '기관' },
  { key: 'lab-assist-run', label: '비서, 바로 실행·되돌리기', group: '기관' },
  { key: 'lab-assist-menu', label: '비서, 서랍 열림', group: '기관' },
  { key: 'lab-assist-find', label: '비서, 과거 견적 찾기', group: '기관' },
  { key: 'lab-assist-record', label: '비서, 회의 녹음', group: '기관' },
  { key: 'lab-runs', label: '활동', group: '기관' },
  { key: 'lab-assist-check', label: '비서, 위 막대 확인 필요', group: '기관' },
  { key: 'sent-cro', label: '보낸 것(기관)', group: '기관' },
  { key: 'alerts-cro', label: '알림(기관)', group: '기관' },
  { key: 'alerts-req', label: '알림(의뢰자)', group: '진행·비교' },
  { key: 'sent-req', label: '보낸 것(의뢰자)', group: '진행·비교' },
  { key: 'gate-error', label: '계정 불러오기 실패', group: '관문·계정' },
  { key: 'gate-wait', label: '기관 승인 대기', group: '관문·계정' },
  { key: 'gate-plan', label: '기관 요금제 Pro 아님', group: '관문·계정' },
  { key: 'gate-other', label: '에이전트를 쓰지 않는 계정', group: '관문·계정' },
  { key: 'consent', label: '국외 이전 동의', group: '관문·계정' },
  { key: 'account', label: '계정', group: '관문·계정' },
  { key: 'logout', label: '로그아웃 확인', group: '관문·계정' },
  { key: 'notfound', label: '찾을 수 없는 요청', group: '관문·계정' },
];

const toView = (key: string): Href => ({ pathname: '/preview', params: { view: key } });
const noop = () => undefined;

/** 탭 화면 미리보기 틀: 위 막대 상태, 아래 탭 막대, 서랍(예시 값) */
const TAB_VIEW: Record<'requester' | 'cro', Record<TabKey, string>> = {
  requester: { index: 'req-home', feed: 'tab-feed-req', ideas: 'tab-ideas-req', todo: 'tab-todo-req', library: 'tab-library-req' },
  cro: { index: 'm02', feed: 'm04', ideas: 'm05', todo: 'm07', library: 'm08' },
};
function InTabs({ role, tab, check = 0, drawer = false, settings = false, character = 'danchu', children }: { role: 'requester' | 'cro'; tab: TabKey; check?: number; drawer?: boolean; settings?: boolean; character?: AgentCharacterId; children: React.ReactNode }) {
  const [open, setOpen] = useState(drawer);
  const [sheet, setSheet] = useState(settings);
  const shell = {
    role,
    character,
    agentName: characterOf(character).name,
    live: true,
    check,
    onCheck: () => router.push(toView(role === 'cro' ? 'm11' : 'sent-req')),
    unread: 2,
    openDrawer: () => setOpen(true),
    openAgent: () => router.push(toView('m10')),
    openSettings: () => setSheet(true),
    chatKey: 0,
    pending: null,
    handoff: noop,
  };
  const chats: DrawerItem[] =
    role === 'cro'
      ? [
          { key: 'a1', label: 'DC-2026-0142 견적', pinned: true, onPress: () => router.push(toView('lab-quote')) },
          { key: 'a2', label: '다 바이오텍 미팅 정리', onPress: noop },
          { key: 'a3', label: '랫드 13주 참여 검토', onPress: noop },
        ]
      : [
          { key: 'r1', label: '복귀돌연변이시험', onPress: () => router.push(toView('approve')) },
          { key: 'a1', label: '반복투여 회복군 기간', onPress: noop },
        ];
  return (
    <ShellProvider value={shell}>
      <DrawerFrame visible={open} onClose={() => setOpen(false)} title={characterOf(character).name} active={tab} onTab={(k) => router.replace(toView(TAB_VIEW[role][k]))} chats={chats} onSettings={() => setSheet(true)} onNew={noop}>
        <View style={styles.root}>
          <View style={{ flex: 1 }}>{children}</View>
          <TabBarView active={tab} unread={2} onPress={(k) => router.replace(toView(TAB_VIEW[role][k]))} />
        </View>
      </DrawerFrame>
      <FullSheet visible={sheet} onClose={() => setSheet(false)}>
        <SettingsBody usage={{ percent: 38, resetsOn: '2026-12-01' }} role={role} demo onClose={() => setSheet(false)} onSwitchRole={noop} />
      </FullSheet>
    </ShellProvider>
  );
}

export default function Preview() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (!view) return <PreviewList />;
  return <PreviewView view={view} />;
}

function PreviewList() {
  const groups = useMemo(() => [...new Set(VIEWS.map((v) => v.group))], []);
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <X size={u(22)} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" style={styles.title} accessibilityRole="header">
          화면 미리보기
        </Txt>
        <View style={{ width: u(44) }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Txt variant="caption" color={tokens.muted} style={{ paddingHorizontal: u(4) }}>
          예시 데이터
        </Txt>
        {groups.map((g) => (
          <View key={g}>
            <Txt variant="caption" color={tokens.muted} style={styles.gh}>
              {g}
            </Txt>
            <View style={styles.grp}>
              {VIEWS.filter((v) => v.group === g).map((v, i) => (
                <Press key={v.key} label={v.label} accessibilityRole="link" onPress={() => router.push(toView(v.key))} style={[styles.gi, i > 0 && styles.line]}>
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {v.label}
                  </Txt>
                  <CaretRight size={u(16)} color={tokens.faint} />
                </Press>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function PreviewView({ view }: { view: string }) {
  const [choices, setChoices] = useState<SendChoices>(CHOICES);
  const [dialog, setDialog] = useState(true);

  switch (view) {
    case 'req-home':
      return reqHome({ kind: 'ready', items: REQ_ITEMS });
    case 'req-home-new':
      return reqHome({ kind: 'ready', items: [] });
    case 'req-home-loading':
      return reqHome({ kind: 'loading' });
    case 'req-home-menu':
      return reqHome({ kind: 'ready', items: REQ_ITEMS }, true);
    case 'character':
      return <CharacterView current="danchu" initial="bibi" onSave={() => router.push(toView('lab-assist-bibi'))} />;
    case 'lab-assist-bibi':
      return (
        <InTabs role="cro" tab="index" character="bibi">
          <AssistView brief={ASSIST_BRIEF} messages={ASSIST_MESSAGES} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'tab-feed-req':
      return (
        <InTabs role="requester" tab="feed">
          <FeedView role="requester" items={ALERTS_REQ} error={null} onRetry={noop} />
        </InTabs>
      );
    case 'tab-feed-lab':
    case 'm04':
      return (
        <InTabs role="cro" tab="feed">
          <FeedView role="cro" items={view === 'm04' ? ALERTS_M04 : ALERTS_CRO} error={null} onRetry={noop} />
        </InTabs>
      );
    case 'tab-todo-req':
      return (
        <InTabs role="requester" tab="todo">
          <TodoView cro={false} rows={requesterWatch(REQ_ITEMS)} error={null} onRetry={noop} goal={null} report={null} onGoal={noop} onOpen={() => router.push(toView('compare'))} onCreate={noop} initialDone={[]} />
        </InTabs>
      );
    case 'tab-todo-lab':
    case 'm07':
      return (
        <InTabs role="cro" tab="todo">
          <TodoView cro rows={labWatch(LAB_LIST)} error={null} onRetry={noop} goal={5} report={{ won: 2, funnel: [{ stage: 'quoted', label: '회신 대기', count: 4 }, { stage: 'nego', label: '협의 중', count: 2 }] }} onGoal={noop} onOpen={() => router.push(toView('lab'))} onCreate={noop} initialDone={[]} now={new Date('2026-12-02T09:00:00+09:00')} />
        </InTabs>
      );
    case 'tab-ideas-req':
      return (
        <InTabs role="requester" tab="ideas">
          <IdeasView ideas={requesterIdeas(REQ_ITEMS)} onGo={noop} initialOpen={undefined} />
        </InTabs>
      );
    case 'm05':
    case 'm06':
      return (
        <InTabs role="cro" tab="ideas">
          <IdeasView ideas={labIdeas(LAB_LIST)} onGo={noop} initialOpen={view === 'm06' ? 'brief' : ''} />
        </InTabs>
      );
    case 'tab-library-req':
      return (
        <InTabs role="requester" tab="library">
          <LibraryView role="requester" rows={libraryRows(SENT_REQ)} error={null} onRetry={noop} />
        </InTabs>
      );
    case 'm08':
      return (
        <InTabs role="cro" tab="library">
          <LibraryView role="cro" rows={libraryRows(SENT_CRO, ASSIST_RUNS_M)} error={null} onRetry={noop} />
        </InTabs>
      );
    case 'm02':
    case 'm09':
    case 'm12':
      return (
        <InTabs role="cro" tab="index" drawer={view === 'm09'} settings={view === 'm12'}>
          <AssistView brief={ASSIST_BRIEF} messages={M02_MESSAGES} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} onTranscript={noop} />
        </InTabs>
      );
    case 'm03':
      return <DanchuQuoteReview no="DC-2026-0142" line="반복투여 13주, 랫드" quote={QUOTE} initialPreview={QUOTE_DOC_READY} onBack={() => router.back()} />;
    case 'm03-req':
      return (
        <ChatShell title="새 요청" bottom={<Composer disabled />}>
          <UserMessage text="랫드 4주 반복투여독성 견적이 필요해요" />
          <AgentText>요청서를 다 채웠어요. 보내기 전에 확인해 주세요.</AgentText>
          <DanchuApprovalCard sheet={SHEET} body={BODY} choices={{ ...CHOICES, purpose: '허가자료 제출용' }} onChange={noop} sending={false} onClose={noop} onApprove={noop} />
        </ChatShell>
      );
    case 'lab-assist-ask':
      return (
        <InTabs role="cro" tab="index">
          <AssistView
            brief={ASSIST_BRIEF}
            messages={[ASSIST_MESSAGES[0]!, { id: 'a1', role: 'agent', text: '다 바이오텍 후속 연락을 할 일로 넣을게요. 권한이 매번 묻기라 먼저 여쭤봐요.' }]}
            actions={[{ key: 'x0', at: 1, label: '할 일 만들기', outcome: 'pending', message: null, runId: null, undoable: false, undone: false, ask: { action: 'task_create', body: { title: '다 바이오텍 후속 연락', due: '2026-12-01', dealId: 'd2' } } }]}
            streaming={null}
            canSend
            error={null}
            onSend={noop}
            onUndo={noop}
            onAllow={noop}
            onReject={noop}
          />
        </InTabs>
      );
    case 'm10':
    case 'm11':
      return <AgentProfileView role="cro" character="danchu" live data={{ sent: SENT_CRO, runs: ASSIST_RUNS_M }} error={null} onRetry={noop} initialTab={view === 'm11' ? 'check' : 'activity'} />;
    case 'm13':
      return <PermissionsView mode="auto" onMode={noop} />;
    case 'm14':
      return <CharacterView current="danchu" initial="bibi" onSave={() => router.push(toView('m15'))} />;
    case 'm15':
      return (
        <InTabs role="cro" tab="index" character="bibi">
          <AssistView brief={ASSIST_BRIEF} messages={M15_MESSAGES} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} onTranscript={noop} />
        </InTabs>
      );
    case 'inbox':
      return <InboxScreen role="requester" items={REQ_ITEMS} filters={REQ_FILTERS} hrefOf={() => toView('compare')} />;
    case 'inbox-lab':
      return <InboxScreen role="cro" title="받은 요청" items={LAB_ITEMS} filters={LAB_FILTERS} hrefOf={() => toView('lab')} />;
    case 'inbox-empty':
      return <InboxScreen role="requester" items={[]} filters={REQ_FILTERS} hrefOf={() => toView('compare')} />;
    case 'inbox-error':
      return (
        <InboxScreen
          role="requester"
          items={[]}
          load="error"
          errorLabel={REMOTE_ERROR.network}
          onRetry={noop}
          filters={REQ_FILTERS}
          hrefOf={() => toView('compare')}
        />
      );
    case 'chat':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_CLINICAL, '필수 7칸 남음')}>
          {IND_HEAD}
        </ChatShell>
      );
    case 'q-press':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_CLINICAL, '필수 7칸 남음', { picked: '3개월 이내' })}>
          {IND_HEAD}
        </ChatShell>
      );
    case 'q-next':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_PRIOR, '필수 7칸 남음')}>
          <UserMessage text="임상 계획: 3개월 이내" />
          <AgentText>임상이 3개월이면 설치류·비설치류 모두 13주 반복투여독성이 기본이에요 (근거: ICH M3 5.1). 이미 끝낸 시험에 따라 견적 범위가 달라져요.</AgentText>
        </ChatShell>
      );
    case 'q-recheck':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_RECHECK, '지금 4주')}>
          <UserMessage text="반복투여는 4주로 해 주세요" />
          <AgentText>반복투여 4주로 채울게요. 다만 임상이 3개월이면 ICH M3 기준으로 설치류·비설치류 모두 임상과 같은 기간의 반복투여독성이 보통 필요해요. 4주 시험은 그보다 짧은 임상까지만 뒷받침해요.</AgentText>
        </ChatShell>
      );
    case 'q-type':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_CLINICAL, '필수 7칸 남음', { text: '건강인 2주, 이후 환자 3개월' })}>
          {IND_HEAD}
        </ChatShell>
      );
    case 'q-sheet':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_CLINICAL, '필수 7칸 남음', { sources: true })}>
          {IND_HEAD}
        </ChatShell>
      );
    case 'q-fold':
      return (
        <ChatShell title="새 요청" flushBottom bottom={qCard(Q_CLINICAL, '필수 7칸 남음', { folded: true })}>
          <AgentText>어떤 시험 견적을 받아 드릴까요?</AgentText>
          {IND_HEAD}
        </ChatShell>
      );
    case 'draft':
      return (
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
          <DraftCard title="요청 본문 초안" body={BODY} action="요청서 확인" onAction={() => router.push(toView('approve'))} />
        </ChatShell>
      );
    case 'approve-sending':
      return (
        <ChatShell title="새 요청" dim bottom={<DanchuApprovalCard sheet={SHEET} body={BODY} choices={{ ...CHOICES, purpose: '허가자료 제출용' }} onChange={noop} sending onClose={noop} onApprove={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
        </ChatShell>
      );
    case 'account':
      return <AccountView name="바이오랩" role="의뢰자" consent={day(0).slice(5).replace('-', '.')} character="danchu" onCharacter={() => router.push(toView('character'))} onManage={noop} onDelete={noop} onRevoke={noop} onLogout={() => router.push(toView('logout'))} />;
    case 'approve':
      return (
        <ChatShell
          title="새 요청"
          dim
          bottom={<DanchuApprovalCard sheet={SHEET} body={BODY} choices={choices} onChange={setChoices} sending={false} onClose={() => router.back()} onApprove={() => router.push(toView('done'))} />}
        >
          {CHAT_HEAD}
          {CHAT_FILLED}
        </ChatShell>
      );
    case 'done':
      return (
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          {CHAT_FILLED}
          <ResultBlock
            title="다 됐어요. 단추에 요청을 보냈어요"
            meta="DC-2026-0142"
            rows={[['회신 기한', '11.26(목)']]}
            action={<Button title="진행 상황 보기" tall onPress={() => router.push(toView('request'))} />}
          />
        </ChatShell>
      );
    case 'request':
      return <DanchuRequestView data={{ request: REQUEST, compare: WAITING }} />;
    case 'compare':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} />;
    case 'select':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} initialSelecting />;
    case 'selected':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true, selected: true }, compare: { open: true, columns: OPEN.open ? OPEN.columns.map((c, i) => ({ ...c, selected: i === 1 })) : [] } }} />;
    case 'contract-req':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true, selected: true }, compare: { open: true, columns: OPEN.open ? OPEN.columns.map((c, i) => ({ ...c, selected: i === 1 })) : [] } }} contractPreview={CONTRACT_TO_CONFIRM} />;
    case 'qna-req':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} qnaPreview={QNA_REQ} />;
    case 'lab-qna':
      return <DanchuLabView it={LAB_SENT} qnaPreview={QNA_LAB} />;
    case 'detail-req':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} detailPreview={DETAIL_REQ} />;
    case 'detail-req-sent':
      return <DanchuRequestView data={{ request: { ...REQUEST, submitted: 3, compareOpen: true }, compare: OPEN }} detailPreview={DETAIL_REQ_SENT} />;
    case 'lab-detail':
      return <DanchuLabView it={LAB_SENT} detailPreview={DETAIL_LAB} />;
    case 'lab':
      return <DanchuLabView it={LAB_TODO} />;
    case 'lab-join':
      return <DanchuLabView it={LAB_TODO} initialSheet="join" />;
    case 'lab-decline':
      return <DanchuLabView it={LAB_TODO} initialSheet="decline" />;
    case 'lab-work':
      return <DanchuLabView it={LAB_WORK} />;
    case 'lab-quote':
    case 'lab-quote-ready':
    case 'lab-quote-calc':
      return <DanchuQuoteReview no="DC-2026-0142" line="반복투여독성, 후보물질 A" quote={QUOTE} initialPreview={view === 'lab-quote' ? QUOTE_DOC : view === 'lab-quote-ready' ? QUOTE_DOC_READY : QUOTE_DOC_DISCOUNT} onBack={() => router.back()} />;
    case 'lab-sent':
      return <DanchuLabView it={LAB_SENT} />;
    case 'lab-won':
      return (
        <DanchuLabView
          it={{ ...LAB_SENT, group: 'won', stage: '선정', next: '계약 보고', steps: [{ label: '요청 받음', at: '', state: 'done' }, { label: '견적 제출', at: '', state: 'done' }, { label: '선정', at: '', state: 'done' }, { label: '계약 보고', at: '', state: 'now' }] }}
          contractPreview={{ awardId: 'a-demo', path: '/cro/awards/a-demo/contract', tests: 3, supply: 86_200_000, vat: 8_620_000, total: 94_820_000, articles: 12, sentAt: null, contractStatus: 'pending' }}
          contractStatusPreview={CONTRACT_BASE}
        />
      );
    case 'lab-contract':
      return (
        <DanchuLabView
          it={{ ...LAB_SENT, group: 'won', stage: '선정', next: '계약 보고', steps: [{ label: '요청 받음', at: '', state: 'done' }, { label: '견적 제출', at: '', state: 'done' }, { label: '선정', at: '', state: 'done' }, { label: '계약 보고', at: '', state: 'now' }] }}
          contractStatusPreview={{ ...CONTRACT_BASE, sponsorSaysSigned: true }}
        />
      );
    case 'lab-assist':
      return (
        <InTabs role="cro" tab="index">
          <AssistView brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-assist-typing':
      return (
        <InTabs role="cro" tab="index">
          <AssistView brief={ASSIST_BRIEF} messages={ASSIST_MESSAGES.slice(0, 1)} actions={[]} streaming={{ step: '브리핑 확인', text: '' }} canSend={false} error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-assist-run':
      return (
        <InTabs role="cro" tab="index">
          <AssistView brief={ASSIST_BRIEF} messages={ASSIST_MESSAGES} actions={ASSIST_ACTIONS} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-assist-find':
      return (
        <InTabs role="cro" tab="index">
          <AssistView brief={ASSIST_BRIEF} messages={FIND_MESSAGES} actions={[]} lookups={FIND_LOOKUPS} lookupPreview={FIND_HITS} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-assist-record':
      return (
        <InTabs role="cro" tab="index">
          <AssistView initialRecordOpen brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onTranscript={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-assist-menu':
      return (
        <InTabs role="cro" tab="index" drawer>
          <AssistView brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'lab-runs':
      return <RunsView items={ASSIST_RUNS} error={null} onRetry={noop} onUndone={noop} />;
    case 'lab-assist-check':
      return (
        <InTabs role="cro" tab="index" check={1}>
          <AssistView brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />
        </InTabs>
      );
    case 'sent-cro':
      return <SentView role="cro" items={SENT_CRO} error={null} onRetry={noop} />;
    case 'alerts-cro':
      return <AlertsView role="cro" items={ALERTS_CRO} error={null} onRetry={noop} />;
    case 'alerts-req':
      return <AlertsView role="requester" items={ALERTS_REQ} error={null} onRetry={noop} />;
    case 'sent-req':
      return <SentView role="requester" items={SENT_REQ} error={null} onRetry={noop} />;
    case 'gate-error':
    case 'gate-wait':
    case 'gate-plan':
    case 'gate-other': {
      const kind: GateKind = view === 'gate-error' ? 'error' : view === 'gate-wait' ? 'org_not_ready' : view === 'gate-plan' ? 'plan_required' : 'unsupported';
      return <GateState kind={kind} onRetry={() => new Promise((r) => setTimeout(r, 1200))} onSignOut={() => router.back()} />;
    }
    case 'consent':
      return (
        <AuthScreen
          title={'에이전트를 쓰려면\n국외 이전 동의가 필요해요'}
          titleVariant="title2"
          gap={u(14)}
          footer={
            <>
              <Button title="필수 동의하고 시작" tall onPress={() => router.back()} />
              <Button title="로그아웃" kind="text" onPress={() => router.back()} />
            </>
          }
        >
          <ConsentBody />
        </AuthScreen>
      );
    case 'logout':
      return (
        <>
          <AccountView name="바이오랩" role="의뢰자" consent={day(0).slice(5).replace('-', '.')} onManage={noop} onLogout={() => setDialog(true)} />
          <LogoutDialog visible={dialog} onClose={() => setDialog(false)} onConfirm={() => setDialog(false)} />
        </>
      );
    case 'notfound':
      return <NotFound label="이 요청을 찾지 못했어요" />;
    default:
      return <NotFound label="없는 미리보기예요" reason="목록에 없는 화면이에요." />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: u(14), paddingTop: u(6), paddingBottom: u(10) },
  title: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl, paddingTop: space.md, gap: space.sm },
  gh: { fontFamily: fonts.bold, paddingHorizontal: u(4), paddingTop: space.md, paddingBottom: space.sm },
  grp: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
  gi: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: u(52) },
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
});
