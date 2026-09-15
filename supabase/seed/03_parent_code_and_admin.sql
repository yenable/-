-- ===========================================================================
-- seed 3) 학부모 공통 참여 코드 + 교사(관리자) 계정 등록
--   * SQL Editor(서비스 권한)에서 실행하세요.
--   * 코드 원문은 DB에 저장되지 않고 bcrypt 해시만 저장됩니다.
-- ===========================================================================

-- (1) 학부모 공통 참여 코드 정하기 -----------------------------------------
--     아래 'TRAVEL2026' 부분만 원하는 코드로 바꿔 실행하세요.
--     입력 시 공백과 대소문자는 무시됩니다.
update public.class_sessions
   set parent_code_hash = crypt(upper(regexp_replace('TRAVEL2026', '\s', '', 'g')), gen_salt('bf')),
       updated_at = now()
 where slug = 'default';

-- (2) 교사 계정을 관리자 allowlist 에 추가 ----------------------------------
--     먼저 Supabase 대시보드 > Authentication > Users 에서
--     교사용 계정을 만들고(Add user, 이메일+비밀번호),
--     아래 이메일만 바꿔서 실행하세요.
insert into public.admin_users (user_id, note)
select id, '담임교사'
from auth.users
where email = 'teacher@school.example'
on conflict (user_id) do nothing;

-- (3) 확인 ------------------------------------------------------------------
-- select u.email, a.note from public.admin_users a join auth.users u on u.id = a.user_id;
