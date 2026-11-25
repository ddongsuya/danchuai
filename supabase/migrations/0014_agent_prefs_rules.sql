-- 권한·목표(Muse 시안 2026-11-25).
-- record_mode: 단추에 기록하는 일(할 일·일정·미팅 기록·안건 단계)을 바로 하고 알릴지(auto), 매번 물을지(ask).
-- 밖으로 보내는 일(참여, 질의 답변, 견적 제출, 계약 보고)은 늘 묻는다. 그래서 따로 두지 않는다.
-- win_goal: 기관 담당자의 이번 달 수주 목표 건수. 진행 숫자는 단추 보고(report)가 계산한다.
alter table agent_prefs add column if not exists record_mode text not null default 'auto' check (record_mode in ('auto', 'ask'));
alter table agent_prefs add column if not exists win_goal smallint check (win_goal between 1 and 999);
