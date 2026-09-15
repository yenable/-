-- ===========================================================================
-- seed 1) 수업 세션 + 여행 상품(모둠) 5개
--   * 0001_init.sql 을 먼저 적용한 뒤 실행하세요.
--   * Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다.
--   * 국가·모둠 번호만 실제 데이터이고, 소개 문구와 대표 사진은 자리표시자입니다.
--     정해지는 대로 아래 update 문(맨 아래)으로 수정하세요.
-- ===========================================================================

-- 슬러그는 .env 의 VITE_SESSION_SLUG 와 같아야 합니다.
insert into public.class_sessions (slug, title, subtitle, tagline, student_capacity)
values ('default', '돌멩홈쇼핑', '세계 여행 특가전',
        '지형과 기후를 담은 최고의 여행 상품을 찾아라!', 18)
on conflict (slug) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      tagline = excluded.tagline,
      student_capacity = excluded.student_capacity;

-- 여행 상품(모둠) ----------------------------------------------------------
-- tagline / image_url 은 지금은 자리표시자입니다.
insert into public.travel_products
  (session_id, group_no, country_name, country_code, display_order, tagline, image_url, theme_color)
select s.id, v.group_no, v.country_name, v.country_code, v.display_order, v.tagline, null, v.theme_color
from public.class_sessions s,
(values
  (1, '덴마크',         'DK', 1, '(자리표시자) 모둠 소개 문구를 넣어 주세요', '#c8102e'),
  (2, '일본',           'JP', 2, '(자리표시자) 모둠 소개 문구를 넣어 주세요', '#d64550'),
  (3, '필리핀',         'PH', 3, '(자리표시자) 모둠 소개 문구를 넣어 주세요', '#0a7bc4'),
  (4, '캐나다',         'CA', 4, '(자리표시자) 모둠 소개 문구를 넣어 주세요', '#e04b3a'),
  (5, '사우디아라비아', 'SA', 5, '(자리표시자) 모둠 소개 문구를 넣어 주세요', '#0f7a52')
) as v(group_no, country_name, country_code, display_order, tagline, theme_color)
where s.slug = 'default'
on conflict (session_id, group_no) do update
  set country_name  = excluded.country_name,
      country_code  = excluded.country_code,
      display_order = excluded.display_order,
      theme_color   = excluded.theme_color;

-- ---------------------------------------------------------------------------
-- 소개 문구 / 대표 사진이 정해지면 아래처럼 수정하세요 (예시)
-- ---------------------------------------------------------------------------
-- update public.travel_products p
--   set tagline   = '바람과 바다를 품은 북유럽 여행',
--       image_url = 'https://.../denmark.jpg'
--   from public.class_sessions s
--  where p.session_id = s.id and s.slug = 'default' and p.group_no = 1;
