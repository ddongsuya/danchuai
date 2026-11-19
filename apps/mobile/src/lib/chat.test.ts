import { EMPTY_SHEET } from '@danchuai/core';
import { describe, expect, it } from 'vitest';

import { chatReducer, initialChat, type ChatAction, type ChatState } from './chat';
import { createSseParser, type SseEvent } from './sse';

const run = (actions: ChatAction[], from: ChatState = initialChat) => actions.reduce(chatReducer, from);
const opened: ChatAction = { type: 'opened', id: 'c1', role: 'requester', sheet: EMPTY_SHEET, missing: ['testType'] };

describe('SSE 해석', () => {
  it('줄 중간에서 끊긴 조각도 이어 붙인다', () => {
    const got: SseEvent[] = [];
    const p = createSseParser((e) => got.push(e));
    p.push('event: text\ndata: {"del');
    p.push('ta":"안녕"}\n\nevent: done\r\n');
    p.push('data: {}\r\n\r\n');
    expect(got).toEqual([
      { event: 'text', data: { delta: '안녕' } },
      { event: 'done', data: {} },
    ]);
  });
  it('깨진 데이터는 버린다', () => {
    const got: SseEvent[] = [];
    createSseParser((e) => got.push(e)).push('event: text\ndata: {oops\n\n');
    expect(got).toEqual([]);
  });
});

describe('대화 상태', () => {
  it('보낸 글 → 흐르는 답 → 끝나면 대화에 남는다', () => {
    const s = run([
      opened,
      { type: 'send', text: '랫드 4주', at: 1 },
      { type: 'server', event: 'step', data: { label: '요청서 확인' } },
      { type: 'server', event: 'text', data: { delta: '정리' } },
      { type: 'server', event: 'text', data: { delta: '했어요.' } },
    ]);
    expect(s.status).toBe('streaming');
    expect(s.streaming).toBe('정리했어요.');
    const done = chatReducer(s, { type: 'ended', at: 2 });
    expect(done.status).toBe('idle');
    expect(done.messages.map((m) => m.text)).toEqual(['랫드 4주', '정리했어요.']);
    expect(done.step).toBeNull();
  });

  it('질문 카드는 다음 글을 보내면 닫힌다', () => {
    const s = run([
      opened,
      { type: 'send', text: 'a', at: 1 },
      { type: 'server', event: 'question', data: { field: 'route', question: '경로는요?', options: ['경구', '정맥'] } },
      { type: 'ended', at: 2 },
    ]);
    expect(s.question?.field).toBe('route');
    expect(run([{ type: 'send', text: '경구', at: 3 }], s).question).toBeNull();
  });

  it('모르는 오류 코드는 provider_error, 연결 끊김은 network로 남기고 다시 보낼 글을 기억한다', () => {
    const s = run([opened, { type: 'send', text: '안녕', at: 1 }, { type: 'server', event: 'error', data: { code: 'weird' } }]);
    expect(s.error).toBe('provider_error');
    const f = run([{ type: 'send', text: '다시', at: 2 }, { type: 'failed', code: 'network', at: 3 }], s);
    expect(f.error).toBe('network');
    expect(f.status).toBe('idle');
    expect(f.lastText).toBe('다시');
  });

  it('초안·요약을 받는다', () => {
    const s = run([
      opened,
      { type: 'send', text: 'a', at: 1 },
      { type: 'server', event: 'draft', data: { body: '견적 요청드려요.', dropped: 1, version: 2 } },
      { type: 'server', event: 'summary', data: { points: ['랫드 4주'] } },
    ]);
    expect(s.draft).toEqual({ body: '견적 요청드려요.', dropped: 1, version: 2 });
    expect(s.summary).toEqual(['랫드 4주']);
  });
});

describe('근거 출처', () => {
  it('흐르는 동안 받은 출처를 답이 끝날 때 그 답에 붙인다', () => {
    const s = run([
      opened,
      { type: 'send', text: '유전독성 표준 조합', at: 1 },
      { type: 'server', event: 'text', data: { delta: '두 가지예요(근거: ICH S2 2.2).' } },
      {
        type: 'server',
        event: 'sources',
        data: { items: [{ doc: 'ICH S2', name: 'ICH S2(R1)', section: '2.2', url: 'https://database.ich.org/x.pdf', version: '2011' }, { doc: 'X', url: 'javascript:alert(1)' }] },
      },
      { type: 'ended', at: 2 },
    ]);
    const a = s.messages.at(-1)!;
    expect(a.sources?.map((x) => x.doc)).toEqual(['ICH S2', 'X']);
    expect(a.sources?.[1]?.url).toBeNull();
    expect(s.pendingSources).toEqual([]);
  });
  it('출처가 없으면 답에 붙이지 않고, 다음 질문에 앞 출처가 남지 않는다', () => {
    const s = run([
      opened,
      { type: 'send', text: 'a', at: 1 },
      { type: 'server', event: 'sources', data: { items: [{ doc: 'ICH M3' }] } },
      { type: 'failed', code: 'network', at: 2 },
      { type: 'send', text: 'b', at: 3 },
      { type: 'server', event: 'text', data: { delta: '답' } },
      { type: 'ended', at: 4 },
    ]);
    expect(s.messages.at(-1)!.sources).toBeUndefined();
  });
});

describe('지난 질문 다시 열기', () => {
  it('저장된 답의 근거를 다시 붙인다', () => {
    const s = run([
      {
        type: 'opened',
        id: 'c1',
        role: 'requester',
        sheet: EMPTY_SHEET,
        missing: [],
        messages: [
          { role: 'user', text: '질문' },
          { role: 'assistant', text: '답(근거: ICH M3 5)', sources: [{ doc: 'ICH M3', name: 'ICH M3(R2)', section: '5', url: 'https://database.ich.org/m3.pdf', version: '2009' }] },
        ],
      },
    ]);
    expect(s.messages[1]!.sources?.[0]?.doc).toBe('ICH M3');
    expect(s.messages[0]!.sources).toBeUndefined();
  });
});

describe('기관 비서 실행 카드', () => {
  const opened: ChatState = chatReducer(initialChat, { type: 'opened', id: 'c1', role: 'cro', sheet: { ...EMPTY_SHEET }, missing: [] });
  it('실행 카드는 이번 턴의 답 자리에 붙고, 되돌리면 표시가 바뀐다', () => {
    let s = chatReducer(opened, { type: 'send', text: '할 일 잡아 줘', at: 1 });
    s = chatReducer(s, { type: 'server', event: 'text', data: { delta: '11월 25일 할 일로 잡을게요.' } });
    s = chatReducer(s, { type: 'server', event: 'action', data: { run: { id: 'r1', undoable: true }, label: '할 일 만들기', outcome: 'done', message: null } });
    s = chatReducer(s, { type: 'server', event: 'action', data: { run: null, label: '안건 단계 옮기기', outcome: 'skipped', message: null } });
    s = chatReducer(s, { type: 'ended', at: 2 });
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'agent']);
    expect(s.actions.map((a) => [a.at, a.label, a.outcome, a.undoable])).toEqual([
      [1, '할 일 만들기', 'done', true],
      [1, '안건 단계 옮기기', 'skipped', false],
    ]);
    s = chatReducer(s, { type: 'undone', runId: 'r1' });
    expect(s.actions[0]).toMatchObject({ undone: true, undoable: false });
  });
  it('모르는 결과 값은 확인 필요로, 문구는 길이를 자른다', () => {
    const s = chatReducer(opened, { type: 'server', event: 'action', data: { outcome: 'weird', label: 'x'.repeat(100), message: 'y'.repeat(300) } });
    expect(s.actions[0]).toMatchObject({ outcome: 'unknown', runId: null });
    expect(s.actions[0]!.label).toHaveLength(60);
    expect(s.actions[0]!.message).toHaveLength(120);
  });
});
