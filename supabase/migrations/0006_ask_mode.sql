-- 0006 가이드라인 질문 대화 (2026-11-16)
-- 요청과 묶이지 않는 질문 대화를 구분한다. 기존 대화는 모두 'request'로 남는다(더하기만 함).
alter table conversations
  add column mode text not null default 'request' check (mode in ('request', 'ask'));

-- 기관 대화는 받은 요청이 있어야 한다. 단 질문 대화는 요청 없이 연다. 질문 대화는 요청과 묶지 않는다.
alter table conversations drop constraint conversations_cro_has_request;
alter table conversations
  add constraint conversations_cro_has_request check (role = 'requester' or mode = 'ask' or request_id is not null),
  add constraint conversations_ask_no_request check (mode = 'request' or request_id is null);

-- down:
-- alter table conversations drop constraint conversations_ask_no_request, drop constraint conversations_cro_has_request;
-- delete from conversations where mode = 'ask';
-- alter table conversations add constraint conversations_cro_has_request check (role = 'requester' or request_id is not null);
-- alter table conversations drop column mode;
