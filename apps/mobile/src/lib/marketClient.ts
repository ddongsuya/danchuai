// 요청·회신·선정 서버 호출(/v1). 조직은 서버가 로그인 토큰으로만 정한다. 앱은 읽고, 선정만 사람이 승인해 보낸다.
import type { QuoteLine, RequestSheet } from '@danchuai/core';

import { call } from './agentClient';

export type RecipientStatus = 'received' | 'viewed' | 'replied' | 'declined' | 'selected' | 'not_selected';

export interface Lab {
  id: string;
  name: string;
}

export interface QuoteView {
  lines: QuoteLine[];
  subtotalWon: number;
  totalWithVatWon: number;
  durationWeeks: number | null;
  body: string | null;
  sentAt: string;
}

export interface RequesterListItem {
  conversationId: string;
  requestId: string | null;
  title: string;
  status: 'drafting' | 'waiting' | 'sent' | 'selected' | 'closed';
  recipients: number;
  replies: number;
  updatedAt: string;
  /** 단추 요청만: 비교표가 열렸는지 */
  compareOpen?: boolean;
}

export interface RequesterRecipient {
  labId: string;
  labName: string;
  status: RecipientStatus;
  receivedAt: string;
  viewedAt: string | null;
  repliedAt: string | null;
  quote: QuoteView | null;
}

export interface RequesterDetail {
  id: string;
  conversationId: string | null;
  title: string;
  status: 'draft' | 'sent' | 'selected' | 'closed';
  sheet: RequestSheet;
  sentAt: string | null;
  selectedOrgId: string | null;
  /** 서버가 회신 도착 순으로 준다(회신 전 기관은 뒤) */
  recipients: RequesterRecipient[];
}

export interface LabInboxItem {
  requestId: string;
  title: string;
  status: RecipientStatus;
  dueDate: string | null;
  receivedAt: string;
  conversationId: string | null;
}

export interface LabDetail {
  requestId: string;
  title: string;
  sheet: RequestSheet;
  message: string | null;
  status: RecipientStatus;
  receivedAt: string;
  conversationId: string | null;
  myQuote: QuoteView | null;
  /** 이 기관이 선정됐을 때만 온다 */
  requester: { orgName: string; name: string | null; email: string | null; selectedAt: string } | null;
}

const id = (v: string) => encodeURIComponent(v);

/* 단추 연동(연동 2단계): 보낸 요청과 받은 요청은 단추에서 읽는다. 공개 규칙은 단추가 적용해 보낸다. */
export const RFQ_NO = /^DC-\d{4}-\d{4,6}$/;

export interface DanchuRequest {
  no: string;
  title: string;
  categories: string[];
  status: string;
  createdAt: string;
  joinBy: string | null;
  replyBy: string | null;
  sent: number;
  joined: number;
  submitted: number;
  compareOpen: boolean;
  selected: boolean;
}

export type DanchuCompare =
  | { open: false; joined: number; submitted: number; replyBy: string | null }
  | { open: true; columns: DanchuCompareColumn[] };

/** 단추 비교표 한 칸. quoteId·revision 은 선정 승인에 그대로 넘긴다. selectable 은 단추 선정 조건(정식 견적서·유효기간) */
export interface DanchuCompareColumn {
  lab: string;
  total: number | null;
  weeks: number | null;
  submittedAt: string | null;
  quoteId?: string | null;
  revision?: number | null;
  selectable?: boolean;
  selected?: boolean;
}

export interface DanchuLabItem {
  no: string;
  title: string;
  categories: string;
  client: string | null;
  clientHint: string;
  group: 'todo' | 'decide' | 'work' | 'sent' | 'won' | 'done';
  stage: string;
  next: string;
  due: string | null;
  steps: { label: string; at: string; state: 'done' | 'now' | 'next' }[];
  money: [string, string][];
}

export const fetchDanchuRequest = (no: string) => call<{ request: DanchuRequest; compare: DanchuCompare }>('requester', `/v1/requests/${id(no)}`);
export const fetchDanchuLabInbox = () => call<{ items: DanchuLabItem[] }>('cro', '/v1/lab/requests').then((r) => r.items);
export const fetchDanchuLabRequest = (no: string) => call<{ item: DanchuLabItem }>('cro', `/v1/lab/requests/${id(no)}`).then((r) => r.item);

export const fetchLabs = () => call<{ labs: Lab[] }>('requester', '/v1/labs').then((r) => r.labs);
export const fetchRequests = () => call<{ items: RequesterListItem[] }>('requester', '/v1/requests').then((r) => r.items);
export const fetchRequest = (requestId: string) => call<RequesterDetail>('requester', `/v1/requests/${id(requestId)}`);
/** 사람이 선정 시트에서 승인한 뒤 한 번만 부른다 */
export const selectLab = (requestId: string, labOrgId: string) =>
  call<{ status: 'selected' }>('requester', `/v1/requests/${id(requestId)}/select`, { labOrgId });

export const fetchLabInbox = () => call<{ items: LabInboxItem[] }>('cro', '/v1/lab/requests').then((r) => r.items);
export const fetchLabRequest = (requestId: string) => call<LabDetail>('cro', `/v1/lab/requests/${id(requestId)}`);
export const markViewed = (requestId: string) => call<null>('cro', `/v1/lab/requests/${id(requestId)}/viewed`, {}).catch(() => null);

export { dayLabel, initialOf } from './format';
