import { describe, expect, it } from 'vitest';

import type { DanchuLabItem } from './marketClient';
import { goalSub, labWatch, monthRange, requesterWatch } from './todo';

const lab = (no: string, group: DanchuLabItem['group'], due: string | null, next = '견적 제출'): DanchuLabItem => ({ no, title: '', categories: '', client: null, clientHint: '', group, stage: '견적 작성 중', next, due, steps: [], money: [] });

describe('할 일', () => {
  it('기관: 끝난 요청은 빼고 기한 이른 순', () => {
    const rows = labWatch([lab('A', 'work', null), lab('B', 'todo', '2026-11-27'), lab('C', 'done', '2026-11-20'), lab('D', 'won', '2026-12-03', '계약 체결 보고')]);
    expect(rows.map((r) => r.id)).toEqual(['B', 'D', 'A']);
    expect(rows[0]).toEqual({ id: 'B', title: 'B 견적 제출', sub: '11월 27일까지예요. 견적 작성 중이에요.' });
    expect(rows[2].sub).toBe('견적 작성 중이에요. 기한은 아직 없어요.');
  });
  it('의뢰자: 선정·닫힘은 빼고 상태 문장', () => {
    const rows = requesterWatch([
      { id: '1', title: 'Ames', sub: '회신 1/3', status: 'sent', when: '', icon: 'dna' },
      { id: '2', title: '랫드', sub: '선정 완료', status: 'selected', when: '', icon: 'flask' },
    ]);
    expect(rows).toEqual([{ id: '1', title: 'Ames', sub: '회신을 기다리는 중이에요. 회신 1/3' }]);
  });
  it('목표 설명과 이번 달 범위(한국 시각)', () => {
    expect(goalSub({ won: 2, funnel: [{ stage: 'a', label: '회신 대기', count: 4 }, { stage: 'b', label: '협의 중', count: 2 }, { stage: 'c', label: '보류', count: 0 }] })).toBe('지금 2건. 회신 대기 4건, 협의 중 2건이에요.');
    expect(monthRange(new Date('2026-11-30T16:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-01', month: 12 });
  });
});
