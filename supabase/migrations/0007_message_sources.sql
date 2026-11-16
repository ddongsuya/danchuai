-- 0007 답이 인용한 원문(출처)을 답과 함께 저장 (2026-11-16)
-- 질문 대화를 다시 열 때 근거를 그대로 보여 준다. 더하기만 함.
alter table messages add column sources jsonb;
-- 지난 질문 목록: 사용자별 질문 대화를 최근 순으로
create index conversations_ask_list_idx on conversations (org_id, created_by, updated_at desc) where mode = 'ask';

-- down:
-- drop index conversations_ask_list_idx;
-- alter table messages drop column sources;
