-- ===========================================================================
-- seed 2) 학생 명단 18명 입력 템플릿
--
--   ⚠️ 아래 '학생01이름' ~ '학생18이름' 자리를 실제 학생 이름으로 바꿔서 실행하세요.
--   ⚠️ 이 파일은 개인정보를 담게 되므로 git에 올리지 마세요.
--
--   * 이름 비교는 공백을 무시합니다('김 하늘' = '김하늘').
--   * 동명이인이 있어도 번호가 다르면 문제없습니다.
--   * 학생이 전학·결석 등으로 빠지면 is_active = false 로 두세요.
--   * 명단은 어떤 경우에도 브라우저로 내려가지 않습니다(서버 RPC에서만 대조).
-- ===========================================================================

insert into public.student_roster (session_id, student_no, student_name)
select s.id, v.no, v.name
from public.class_sessions s,
(values
  (1,  '학생01이름'),
  (2,  '학생02이름'),
  (3,  '학생03이름'),
  (4,  '학생04이름'),
  (5,  '학생05이름'),
  (6,  '학생06이름'),
  (7,  '학생07이름'),
  (8,  '학생08이름'),
  (9,  '학생09이름'),
  (10, '학생10이름'),
  (11, '학생11이름'),
  (12, '학생12이름'),
  (13, '학생13이름'),
  (14, '학생14이름'),
  (15, '학생15이름'),
  (16, '학생16이름'),
  (17, '학생17이름'),
  (18, '학생18이름')
) as v(no, name)
where s.slug = 'default'
on conflict (session_id, student_no) do update
  set student_name = excluded.student_name,
      is_active = true;

-- 확인용 (이름은 보이지 않게 인원 수만 셉니다)
-- select count(*) as 등록된_학생수 from public.student_roster r
--   join public.class_sessions s on s.id = r.session_id
--  where s.slug = 'default' and r.is_active;
