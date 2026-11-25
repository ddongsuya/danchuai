import { describe, expect, it } from 'vitest';

import { labIdeas, requesterIdeas } from './ideas';
import type { DanchuLabItem } from './marketClient';

const lab = (no: string, group: DanchuLabItem['group'], due: string | null = null): DanchuLabItem => ({ no, title: '랫드 13주', categories: '반복투여독성', client: null, clientHint: '', group, stage: '', next: '', due, steps: [], money: [] });

describe('맡길 일', () => {
  it('기관: 견적 작성 중 요청과 선정 요청에서만 요청별 제안을 만든다', () => {
    const ideas = labIdeas([lab('DC-2026-0142', 'work', '2026-11-27'), lab('DC-2026-0131', 'won')]);
    expect(ideas[0]).toMatchObject({ title: '11월 27일 전에 0142 견적서를 마무리해 둘게요', go: { kind: 'quote', no: 'DC-2026-0142' } });
    expect(ideas.find((x) => x.go.kind === 'lab')?.title).toBe('선정된 0131, 계약 체결 보고를 준비할게요');
    expect(ideas.every((x) => x.includes.length === 3)).toBe(true);
  });
  it('기관: 받은 요청이 없으면 요청별 제안 없이 정리·녹음·보고만', () => {
    expect(labIdeas([]).map((x) => x.key)).toEqual(['brief', 'record', 'week']);
  });
  it('의뢰자: 기관을 고르거나 추천하는 제안은 없다', () => {
    const ideas = requesterIdeas([{ id: 'r1', title: 'Ames 시험', sub: '', status: 'replied', when: '', icon: 'dna' }]);
    expect(ideas.map((x) => x.title).join(' ')).not.toMatch(/추천해|싼 곳|가장 좋은|1위/);
    expect(ideas[0].go).toEqual({ kind: 'request', id: 'r1' });
  });
});
