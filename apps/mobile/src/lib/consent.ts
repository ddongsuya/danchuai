// 국외 이전·AI 처리 동의 (연동 2단계). 서버의 CONSENT_VERSION(apps/server/src/danchuAuth.ts)과 같은 판이어야 한다.
// 문구는 개인정보 보호법 제28조의8(국외 이전) 고지 항목을 따른다. 최종 문구는 단추 처리방침 개정(연동 3단계)과 함께 확정한다.
export const CONSENT_VERSION = '2026-11-17';

export interface TransferRow {
  to: string;
  country: string;
  purpose: string;
  items: string;
  keep: string;
}

export const TRANSFERS: TransferRow[] = [
  {
    to: 'Anthropic, PBC',
    country: '미국',
    purpose: 'AI 답변 만들기',
    items: '대화 내용, 요청서·견적 내용',
    keep: 'Anthropic 정책에 따른 기간',
  },
  {
    to: 'Supabase, Inc. (일본 도쿄 리전)',
    country: '일본',
    purpose: '대화 기록 저장',
    items: '대화 내용, 단추 계정 id',
    keep: '대화 삭제 또는 계정 탈퇴까지',
  },
];
