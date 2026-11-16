-- 단추에서 실행할 동작을 보내기 장부로 승인한다 (연동 4·5단계, 2026-11-17). 기준: handoff-to-gpt-1117 5장.
-- kind 'danchu': 본문은 단추 /api/agent/* 로 보낼 JSON 그대로다. 사람이 본 본문(해시)과 보낸 본문이 같다.
--   상대 조직은 자기 조직으로 둔다(받는 쪽은 단추가 정한다).
-- status 'failed': 단추가 확실히 거절했다(4xx). 결과를 모를 때(unknown)와 나눈다. 다시 보내려면 새 초안.
-- result: 단추 응답 본문(요청 번호, 거절 사유 문장 등). 프롬프트·대화 본문은 넣지 않는다.

alter table outbound_drafts drop constraint if exists outbound_drafts_kind_check;
alter table outbound_drafts add constraint outbound_drafts_kind_check check (kind in ('request', 'reply', 'question', 'danchu'));

alter table outbound_drafts drop constraint if exists outbound_drafts_status_check;
alter table outbound_drafts add constraint outbound_drafts_status_check
  check (status in ('drafted', 'approved', 'rejected', 'dispatching', 'sent', 'unknown', 'failed'));

alter table outbound_drafts drop constraint if exists outbound_not_self;
alter table outbound_drafts add constraint outbound_not_self
  check ((kind = 'danchu' and counterparty_org_id = org_id) or (kind <> 'danchu' and counterparty_org_id <> org_id));

alter table outbound_drafts add column if not exists result jsonb;

alter table deliveries drop constraint if exists deliveries_outcome_check;
alter table deliveries add constraint deliveries_outcome_check check (outcome in ('sent', 'unknown', 'failed'));
