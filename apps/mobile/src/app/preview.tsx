// 화면 미리보기. 예시 값만 쓰고 서버를 부르지 않는다. 로그인 없이 열린다(_layout).
// /preview 는 목록, /preview?view=<이름> 은 그 화면 하나. 실제 화면과 같은 컴포넌트를 그대로 쓴다.
// 예시 값은 진단 문서 시안과 같다(사용자 선택 2026-11-17 "시안대로": DC-2026-0142, 가·나·다·라 기관, 후보물질 A). 실제 회사·사람·연락처는 넣지 않는다.
import { applyQuotePatch, quoteDraftFromBrief, type RequestSheet } from '@danchuai/core';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CaretRight, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountView } from '@/app/account/index';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ConsentBody } from '@/components/auth/ConsentBody';
import { GateState, type GateKind } from '@/components/auth/GateState';
import { LogoutDialog } from '@/components/auth/LogoutDialog';
import { ChatShell } from '@/components/chat/ChatShell';
import { Composer } from '@/components/chat/Composer';
import { DraftCard } from '@/components/chat/DraftCard';
import { AgentText, StepLog, UserMessage } from '@/components/chat/Messages';
import { NotFound } from '@/components/chat/NotFound';
import { QuestionCard } from '@/components/chat/QuestionCard';
import { InboxScreen } from '@/components/inbox/InboxScreen';
import { AssistView, croMenu } from '@/components/lab/AssistChat';
import { RequesterHomeView, requesterMenu } from '@/components/agent/RequesterHome';
import { RunsView } from '@/app/lab/runs';
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
import type { SendChoices } from '@/lib/danchuRequest';
import type { InboxItem } from '@/lib/inbox';
import type { DanchuCompare, DanchuLabItem, DanchuRequest } from '@/lib/marketClient';

/** 오늘에서 n일 뒤 날짜(YYYY-MM-DD, 기기 날짜). 기한 숫자가 늘 그럴듯하게 보이도록 */
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const REQ_FILTERS = [
  { label: '전체', match: null },
  { label: '회신 도착', match: ['replied' as const] },
  { label: '승인 대기', match: ['waiting' as const] },
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
    <AgentText>어떤 시험 견적이 필요해요?</AgentText>
    <UserMessage text="랫드 4주 반복투여독성, 회복군 포함이요" />
  </>
);
const CHAT_FILLED = <AgentText>요청서를 다 채웠어요.</AgentText>;
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
  { id: 'a1', role: 'agent' as const, text: '다 바이오텍 후속 연락을 11월 25일 할 일로 잡고, 라 제약 랫드 PK는 협의 단계로 옮길게요.' },
];
const ASSIST_ACTIONS = [
  { key: 'x0', at: 1, label: '할 일 만들기', outcome: 'done' as const, message: null, runId: 'r1', undoable: true, undone: false },
  { key: 'x1', at: 1, label: '안건 단계 옮기기', outcome: 'done' as const, message: null, runId: 'r2', undoable: false, undone: true },
];

const ASSIST_MENU = { title: '비서', sub: '가 기관', items: croMenu(1).map((it) => ({ ...it, onPress: () => router.push(toView(it.key === 'runs' ? 'lab-runs' : it.key === 'inbox' ? 'inbox-lab' : 'account')) })) };
const ASSIST_RUNS = [
  { id: 'r1', action: 'task_create', label: '할 일 만들기', outcome: 'done' as const, undoable: true, undone: false, createdAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: 'r2', action: 'deal_move', label: '안건 단계 옮기기', outcome: 'done' as const, undoable: false, undone: true, createdAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: 'r3', action: 'event_create', label: '일정 잡기', outcome: 'failed' as const, undoable: false, undone: false, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const REQ_MENU = { title: '비서', sub: '가 제약', items: requesterMenu(1).map((it) => ({ ...it, onPress: () => router.push(toView(it.key === 'inbox' ? 'inbox' : 'account')) })) };
const reqHome = (recent: Parameters<typeof RequesterHomeView>[0]['recent'], menuOpen = false) => (
  <RequesterHomeView menu={REQ_MENU} initialMenuOpen={menuOpen} recent={recent} onRetry={noop} onStart={() => router.push(toView('chat'))} onAsk={noop} onOpen={() => router.push(toView('compare'))} onAll={() => router.push(toView('inbox'))} />
);

type View_ = { key: string; label: string; group: string };
const VIEWS: View_[] = [
  { key: 'req-home', label: '의뢰자 첫 화면, 최근 요청', group: '첫 화면' },
  { key: 'req-home-new', label: '의뢰자 첫 화면, 요청 없음', group: '첫 화면' },
  { key: 'req-home-loading', label: '의뢰자 첫 화면, 불러오는 중', group: '첫 화면' },
  { key: 'req-home-menu', label: '의뢰자 첫 화면, 메뉴 열림', group: '첫 화면' },
  { key: 'inbox', label: '요청함(의뢰자)', group: '요청함' },
  { key: 'inbox-lab', label: '요청함(기관)', group: '요청함' },
  { key: 'inbox-empty', label: '요청함, 요청 없음', group: '요청함' },
  { key: 'inbox-error', label: '요청함, 불러오기 실패', group: '요청함' },
  { key: 'chat', label: '새 요청 대화, 질문 카드', group: '새 요청' },
  { key: 'draft', label: '요청 본문 초안', group: '새 요청' },
  { key: 'approve', label: '요청서 확인(승인 카드)', group: '새 요청' },
  { key: 'approve-sending', label: '요청서 확인, 요청하는 중', group: '새 요청' },
  { key: 'done', label: '요청 완료', group: '새 요청' },
  { key: 'request', label: '진행, 회신 받는 중', group: '진행·비교' },
  { key: 'compare', label: '진행, 비교표 열림', group: '진행·비교' },
  { key: 'select', label: '기관 선정 시트', group: '진행·비교' },
  { key: 'selected', label: '진행, 선정 뒤', group: '진행·비교' },
  { key: 'lab', label: '받은 요청, 할 일 있음', group: '기관' },
  { key: 'lab-join', label: '받은 요청, 참여하기 시트', group: '기관' },
  { key: 'lab-decline', label: '받은 요청, 불참 시트', group: '기관' },
  { key: 'lab-work', label: '받은 요청, 참여 뒤(AI 견적)', group: '기관' },
  { key: 'lab-quote', label: '견적 확인, 직접 입력 남음', group: '기관' },
  { key: 'lab-quote-ready', label: '견적 확인, 제출 가능', group: '기관' },
  { key: 'lab-quote-calc', label: '견적 확인, 단추 계산으로 채움', group: '기관' },
  { key: 'lab-sent', label: '받은 요청, 제출 뒤', group: '기관' },
  { key: 'lab-assist', label: '비서 홈(기관 첫 화면), 오늘 브리핑', group: '기관' },
  { key: 'lab-assist-typing', label: '비서, 답 준비 중(점 셋)', group: '기관' },
  { key: 'lab-assist-run', label: '비서, 바로 실행·되돌리기', group: '기관' },
  { key: 'lab-assist-menu', label: '비서, 메뉴 열림', group: '기관' },
  { key: 'lab-assist-find', label: '비서, 과거 견적 찾기', group: '기관' },
  { key: 'lab-assist-record', label: '비서, 회의 녹음', group: '기관' },
  { key: 'lab-runs', label: '실행 기록', group: '기관' },
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
        <ChatShell title="새 요청" bottom={<Composer onSend={noop} />}>
          {CHAT_HEAD}
          <StepLog steps={[{ label: '요청서 항목 맞추는 중', state: 'now' }]} />
          <QuestionCard title="투여 경로" questions={[{ id: 'route', label: '어떤 경로로 투여해요?', options: ['경구', '정맥', '피하'] }]} onSubmit={() => router.push(toView('approve'))} onSkip={noop} />
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
      return <AccountView name="바이오랩" role="의뢰자" consent={day(0).slice(5).replace('-', '.')} onManage={noop} onLogout={() => router.push(toView('logout'))} />;
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
            title="단추에 요청했어요"
            meta="DC-2026-0142"
            rows={[['회신 기한', '11.26(목)']]}
            action={<Button title="진행 보기" tall onPress={() => router.push(toView('request'))} />}
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
    case 'lab':
      return <DanchuLabView it={LAB_TODO} />;
    case 'lab-join':
      return <DanchuLabView it={LAB_TODO} initialSheet="join" />;
    case 'lab-decline':
      return <DanchuLabView it={LAB_TODO} initialSheet="decline" />;
    case 'lab-work':
      return <DanchuLabView it={LAB_WORK} />;
    case 'lab-quote-calc':
      return <DanchuQuoteReview no="DC-2026-0142" line="반복투여독성, 후보물질 A" quote={QUOTE} initialCalc={{ 3: 31_500_000 }} onBack={() => router.back()} />;
    case 'lab-quote':
    case 'lab-quote-ready':
      return <DanchuQuoteReview no="DC-2026-0142" line="반복투여독성, 후보물질 A" quote={QUOTE} initialManual={view === 'lab-quote-ready' ? { 3: '32000000' } : {}} onBack={() => router.back()} />;
    case 'lab-sent':
      return <DanchuLabView it={LAB_SENT} />;
    case 'lab-assist':
      return <AssistView menu={ASSIST_MENU} brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />;
    case 'lab-assist-typing':
      return <AssistView menu={ASSIST_MENU} brief={ASSIST_BRIEF} messages={ASSIST_MESSAGES.slice(0, 1)} actions={[]} streaming={{ step: '브리핑 확인', text: '' }} canSend={false} error={null} onSend={noop} onUndo={noop} />;
    case 'lab-assist-run':
      return <AssistView menu={ASSIST_MENU} brief={ASSIST_BRIEF} messages={ASSIST_MESSAGES} actions={ASSIST_ACTIONS} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />;
    case 'lab-assist-find':
      return <AssistView menu={ASSIST_MENU} brief={ASSIST_BRIEF} messages={FIND_MESSAGES} actions={[]} lookups={FIND_LOOKUPS} lookupPreview={FIND_HITS} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />;
    case 'lab-assist-record':
      return <AssistView menu={ASSIST_MENU} initialRecordOpen brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onTranscript={noop} onUndo={noop} />;
    case 'lab-assist-menu':
      return <AssistView menu={ASSIST_MENU} initialMenuOpen brief={ASSIST_BRIEF} messages={[]} actions={[]} streaming={null} canSend error={null} onSend={noop} onUndo={noop} />;
    case 'lab-runs':
      return <RunsView items={ASSIST_RUNS} error={null} onRetry={noop} onUndone={noop} />;
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
      return <NotFound label="요청을 찾을 수 없어요" />;
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
