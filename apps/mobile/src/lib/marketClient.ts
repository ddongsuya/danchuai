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
