-- 0005 요청 보내기·회신·선정 (2026-11-16). 명세: docs/product/v1-capability.md
-- 더하기만 한다(기존 열을 지우거나 이름을 바꾸지 않음). requests·request_recipients·quotes는 아직 운영 데이터가 없다.
-- 되돌리기: 맨 아래 "down" 주석.

-- 1) 요청: 어느 대화에서 나왔는지, 제목, 보낸 시각, 선정 결과
alter table requests
  add column conversation_id uuid unique references conversations (id) on delete set null,
  add column title text check (char_length(title) between 1 and 80),
  add column sent_at timestamptz,
  add column selected_org_id uuid references orgs (id),
  add column selected_by uuid references auth.users (id),
  add column selected_at timestamptz;
alter table requests drop constraint requests_status_check;
alter table requests add constraint requests_status_check check (status in ('draft', 'sent', 'selected', 'closed'));
alter table requests add constraint requests_selected_consistent
  check ((status = 'selected') = (selected_org_id is not null and selected_by is not null and selected_at is not null));

-- 2) 받은 기관별 상태와 그 기관이 받은 본문(승인된 원문 그대로)
alter table request_recipients
  add column status text not null default 'received'
    check (status in ('received', 'viewed', 'replied', 'declined', 'selected', 'not_selected')),
  add column message text,
  add column draft_id uuid references outbound_drafts (id) on delete set null,
  add column received_at timestamptz not null default now(),
  add column viewed_at timestamptz,
  add column replied_at timestamptz;

-- 3) 회신 견적: 승인된 회신 본문, 발송 초안, 소요 기간. 한 초안에 견적 하나.
alter table quotes
  add column body text,
  add column draft_id uuid unique references outbound_drafts (id) on delete set null,
  add column total_with_vat_won bigint check (total_with_vat_won >= 0);

-- 4) 보내기 초안에 사람이 넣은 견적 줄(원 단위 정수)과 기간. 발송 때 quotes로 옮긴다(합계는 서버 계산).
alter table outbound_drafts
  add column quote_lines jsonb,
  add column duration_weeks int check (duration_weeks between 1 and 520);

-- 5) 인덱스: 기관 받은 요청함(최근 순), 요청별 회신, 대화별 요청
create index request_recipients_cro_received_idx on request_recipients (cro_org_id, received_at desc);
create index requests_org_created_idx on requests (org_id, created_at desc);
create index requests_selected_org_idx on requests (selected_org_id) where selected_org_id is not null;
create index requests_selected_by_idx on requests (selected_by) where selected_by is not null;
create index request_recipients_draft_idx on request_recipients (draft_id) where draft_id is not null;

-- 6) 앱은 읽기만(0002·0004와 같은 기본값). 새 열은 기존 표 권한을 그대로 따른다.

-- down (되돌리기, 위에서 아래 순서):
-- drop index request_recipients_draft_idx, requests_selected_by_idx, requests_selected_org_idx,
--   requests_org_created_idx, request_recipients_cro_received_idx;
-- alter table outbound_drafts drop column duration_weeks, drop column quote_lines;
-- alter table quotes drop column total_with_vat_won, drop column draft_id, drop column body;
-- alter table request_recipients drop column replied_at, drop column viewed_at, drop column received_at,
--   drop column draft_id, drop column message, drop column status;
-- alter table requests drop constraint requests_selected_consistent, drop constraint requests_status_check;
-- alter table requests add constraint requests_status_check check (status in ('draft', 'sent', 'closed'));
-- alter table requests drop column selected_at, drop column selected_by, drop column selected_org_id,
--   drop column sent_at, drop column title, drop column conversation_id;
