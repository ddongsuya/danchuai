import { describe, expect, it } from 'vitest';

import { libraryRows, whenShort } from './library';

describe('자료 결과물', () => {
  it('보낸 것과 만든 것만, 최근 것부터. 실패·되돌린 것은 뺀다', () => {
    const rows = libraryRows(
      [
        { id: '1', action: 'quote_submit', rfqNo: 'DC-2026-0142', status: 'sent', at: '2026-11-25T05:20:00Z', mine: true, reason: null },
        { id: '2', action: 'join', rfqNo: 'DC-2026-0147', status: 'failed', at: '2026-11-25T06:00:00Z', mine: true, reason: null },
      ],
      [
        { id: 'a', action: 'crm_activity', label: '기록 남기기', outcome: 'done', undoable: true, undone: false, createdAt: '2026-11-24T01:40:00Z' },
        { id: 'b', action: 'quote_doc', label: '견적서 만들기', outcome: 'done', undoable: true, undone: true, createdAt: '2026-11-25T07:00:00Z' },
        { id: 'c', action: 'task_create', label: '할 일 만들기', outcome: 'done', undoable: true, undone: false, createdAt: '2026-11-25T08:00:00Z' },
      ],
    );
    expect(rows.map((r) => r.title)).toEqual(['견적 제출, DC-2026-0142', '미팅 기록']);
  });
  it('시각 줄', () => {
    const now = new Date(2026, 10, 25, 18, 0);
    expect(whenShort(new Date(2026, 10, 25, 14, 20).toISOString(), now)).toBe('오늘 14:20');
    expect(whenShort(new Date(2026, 10, 24, 9, 0).toISOString(), now)).toBe('어제');
    expect(whenShort(new Date(2026, 10, 21, 9, 0).toISOString(), now)).toBe('11월 21일');
  });
});
