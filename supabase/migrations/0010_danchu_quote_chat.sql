-- 말로 맡기는 견적 2단계 (2026-11-18): 단추 요청(DC-...)으로 여는 기관 견적 대화와 승인 뒤 상태.
-- 1) conversations.danchu_rfq_no: 대화가 다루는 단추 요청 번호. 기관 견적 대화는 받은 요청,
--    의뢰자 대화는 단추에 접수된 뒤 받은 번호(요청함에서 같은 요청이 "작성 중"으로 두 번 보이지 않게).
--    레거시 request_id(uuid, 에이전트 DB requests)와 따로 둔다. 단추 요청은 단추 DB에만 있다.
-- 2) conversations.quote: 기관 견적 초안(단추 회신 구조, 부가세 별도). 금액은 단추 계산값 또는 담당자 입력.
--    프롬프트·대화 본문은 넣지 않는다(messages 표에 따로 있다).
-- RLS: 열만 늘린다. 기존 conversations 정책(is_member(org_id))이 그대로 적용된다.

alter table conversations
  add column if not exists danchu_rfq_no text check (danchu_rfq_no ~ '^DC-[0-9]{4}-[0-9]{4,6}$'),
  add column if not exists quote jsonb;

-- 기관 요청 대화는 레거시 요청이나 단추 요청 중 하나에 묶인다
alter table conversations drop constraint if exists conversations_cro_has_request;
alter table conversations
  add constraint conversations_cro_has_request
  check (role = 'requester' or mode = 'ask' or request_id is not null or danchu_rfq_no is not null);

create index if not exists conversations_danchu_rfq_idx
  on conversations (org_id, created_by, danchu_rfq_no, updated_at desc)
  where danchu_rfq_no is not null;
