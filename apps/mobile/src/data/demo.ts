// 시연용 자료. 기관 이름은 실제 기관이 아닌 "가·나·다 기관" 자리 표시다.
// 금액은 원 단위 정수로만 두고, 화면 표시는 @danchuai/core 의 formatWonShort·computeTotals 로 계산한다.
import type { QuoteLine } from '@danchuai/core';

export type RequestStatus = 'new' | 'waiting' | 'drafting' | 'sent' | 'replied';

export interface RequestSummary {
  id: string;
  title: string;
  sub: string;
  status: RequestStatus;
  when: string;
  icon: 'flask' | 'dna' | 'drop';
}

export const requesterRequests: RequestSummary[] = [
  { id: 'rat-4w', title: '랫드 4주 반복투여독성', sub: '회신 2/3', status: 'replied', when: '오늘', icon: 'flask' },
  { id: 'dog-13w', title: '비글견 13주 반복투여독성', sub: '보낼 본문 준비됨', status: 'waiting', when: '어제', icon: 'flask' },
  { id: 'ames', title: '복귀돌연변이시험', sub: '요청서 작성 중', status: 'drafting', when: '11월 13일', icon: 'dna' },
];

export const labRequests: RequestSummary[] = [
  { id: 'rat-4w', title: '랫드 4주 반복투여독성', sub: '기한 11월 29일', status: 'new', when: '오늘', icon: 'flask' },
  { id: 'dog-13w', title: '비글견 13주 반복투여독성', sub: '회신 초안 준비됨', status: 'waiting', when: '어제', icon: 'flask' },
  { id: 'ames', title: '복귀돌연변이시험', sub: '단가표 확인 중', status: 'drafting', when: '11월 13일', icon: 'dna' },
  { id: 'mouse-pk', title: '마우스 약동학', sub: '회신 완료', status: 'sent', when: '11월 12일', icon: 'drop' },
];

export const requestTitle: Record<string, string> = Object.fromEntries(
  [...requesterRequests, ...labRequests].map((r) => [r.id, r.title]),
);

export const requesterAsk = '랫드 4주 반복투여 독성시험 견적 받아 줘. 회복군 넣고 TK도 포함해 줘.';

export const recipients = [
  { id: 'a', short: '가', name: '가 기관' },
  { id: 'b', short: '나', name: '나 기관' },
  { id: 'c', short: '다', name: '다 기관' },
];

export const questionSet = [
  { id: 'form', label: '시험물질 제형', options: ['액상', '분말', '현탁액', '미정'] },
  { id: 'due', label: '회신 기한', options: ['1주', '2주', '직접 입력'] },
];

export const requestBody =
  '안녕하세요. 랫드 4주 반복투여 독성시험(회복 2주, TK 포함) 견적을 요청드려요. 시험물질은 액상 제형이에요. 군 구성과 분석 항목은 첨부한 요청서에 정리했어요. 11월 29일까지 회신 부탁드려요.';

/** 회신. receivedAt 순서(도착 순)로만 정렬한다. 순위·추천 없음. */
export interface Reply {
  recipientId: string;
  receivedAt: string; // ISO
  receivedLabel: string;
  totalWithVatWon: number;
  durationWeeks: number;
  recoveryPerGroup: number;
  tk: boolean;
}

export const replies: Reply[] = [
  { recipientId: 'c', receivedAt: '2026-11-19T09:05:00+09:00', receivedLabel: '11월 19일', totalWithVatWon: 130_500_000, durationWeeks: 12, recoveryPerGroup: 3, tk: true },
  { recipientId: 'a', receivedAt: '2026-11-18T14:20:00+09:00', receivedLabel: '11월 18일', totalWithVatWon: 124_300_000, durationWeeks: 14, recoveryPerGroup: 5, tk: true },
];

export const replyDue = '11월 29일';

export const labAsk = '단가표 기준으로 견적 초안 만들어 줘. 회복군은 군당 5마리로.';

export const labQuoteLines: (QuoteLine & { note: string })[] = [
  { label: '반복투여 4주', note: '4군', amountWon: 82_000_000 },
  { label: '회복 2주', note: '군당 5', amountWon: 14_000_000 },
  { label: 'TK 분석', note: '위성군 3군', amountWon: 17_000_000 },
];

export const labDurationWeeks = 14;
