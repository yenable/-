-- ===========================================================================
-- 돌멩홈쇼핑 · 세계 여행 특가전
-- 초등 공개수업용 실시간 여행 상품 구매(투표) 사이트 - 초기 스키마
--
-- 적용 방법(둘 중 하나)
--   1) Supabase 대시보드 > SQL Editor 에 이 파일 내용을 붙여넣고 실행
--   2) supabase CLI:  supabase db push   (supabase/migrations 에 둔 채로)
--
-- 보안 요약
--   * 모든 테이블은 RLS 활성 + 정책 없음(= 클라이언트 직접 접근 전면 차단)
--   * 클라이언트는 아래 SECURITY DEFINER RPC 만 호출할 수 있다
--   * 학생 명단(student_roster)은 어떤 경우에도 클라이언트로 내려가지 않는다
--   * 참여권(access_passes)과 익명 구매(purchase_submissions)는 서로 연결되지 않는다
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 타입
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.session_phase as enum ('waiting', 'open', 'closed', 'revealed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reveal_scope as enum ('none', 'top1', 'top2', 'top3', 'all');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.participant_type as enum ('student', 'parent');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

-- 수업 세션 (상태 · 공개 범위 · 학부모 코드 해시)
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default '돌멩홈쇼핑',
  subtitle text not null default '세계 여행 특가전',
  tagline text not null default '지형과 기후를 담은 최고의 여행 상품을 찾아라!',
  phase public.session_phase not null default 'waiting',
  reveal_scope public.reveal_scope not null default 'none',
  -- 학부모 공통 참여 코드는 crypt() 해시로만 저장한다 (원문 저장 금지)
  parent_code_hash text,
  student_capacity int not null default 18 check (student_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 여행 상품(모둠)
create table if not exists public.travel_products (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  group_no int not null check (group_no > 0),
  country_name text not null,
  country_code text not null default '',
  display_order int not null default 1,
  tagline text,
  image_url text,
  theme_color text not null default '#2f6fb5',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, group_no)
);

-- 학생 명단 (개인정보 · 공개 조회 금지)
create table if not exists public.student_roster (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_no int not null check (student_no > 0),
  student_name text not null,
  is_active boolean not null default true,
  -- 발급된 참여권(1인 1장). 참여권은 어떤 구매와도 연결되지 않는다.
  pass_id uuid,
  created_at timestamptz not null default now(),
  unique (session_id, student_no)
);

-- 참여권 (임시 토큰의 해시만 저장)
create table if not exists public.access_passes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  participant_type public.participant_type not null,
  token_hash text not null unique,
  browser_key_hash text,
  is_used boolean not null default false,
  issued_at timestamptz not null default now(),
  used_at timestamptz
);

-- 같은 브라우저에서 학부모 참여권이 두 번 발급되지 않도록
create unique index if not exists access_passes_parent_browser_uniq
  on public.access_passes (session_id, browser_key_hash)
  where participant_type = 'parent' and browser_key_hash is not null;

-- 익명 구매 1건 (학생 번호·이름과 연결되는 컬럼이 없다)
create table if not exists public.purchase_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  participant_type public.participant_type not null,
  review text not null,
  created_at timestamptz not null default now(),
  -- 기대평 길이 검사(프런트엔드와 동일 규칙): 앞뒤 공백 제외 80자 이하,
  -- 공백을 모두 뺀 글자 수 2자 이상
  constraint review_len check (
    char_length(btrim(review)) between 1 and 80
    and char_length(regexp_replace(review, '\s', '', 'g')) >= 2
  )
);

-- 구매에 포함된 상품 선택 (학생 1행 / 학부모 2행)
create table if not exists public.vote_choices (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.purchase_submissions (id) on delete cascade,
  product_id uuid not null references public.travel_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (submission_id, product_id)  -- 같은 구매에서 같은 상품 중복 금지
);

create index if not exists vote_choices_product_idx on public.vote_choices (product_id);
create index if not exists submissions_session_idx on public.purchase_submissions (session_id);

-- 교사(관리자) allowlist — 비밀번호/UID를 소스 코드에 넣지 않기 위한 테이블
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: 모든 테이블 활성 + 정책 없음 => 클라이언트 직접 접근 전면 차단
-- (아래 SECURITY DEFINER 함수만 데이터에 접근한다)
-- ---------------------------------------------------------------------------
alter table public.class_sessions        enable row level security;
alter table public.travel_products       enable row level security;
alter table public.student_roster        enable row level security;
alter table public.access_passes         enable row level security;
alter table public.purchase_submissions  enable row level security;
alter table public.vote_choices          enable row level security;
alter table public.admin_users           enable row level security;

alter table public.class_sessions        force row level security;
alter table public.student_roster        force row level security;
alter table public.access_passes         force row level security;

-- ---------------------------------------------------------------------------
-- 내부 헬퍼
-- ---------------------------------------------------------------------------

create or replace function public.hash_token(p_value text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(coalesce(p_value, ''), 'sha256'), 'hex');
$$;

create or replace function public.norm_name(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(coalesce(p_value, ''), '\s', '', 'g');
$$;

create or replace function public.norm_code(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '\s', '', 'g'));
$$;

-- 현재 로그인 사용자가 교사(관리자)인지
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_user() then
    raise exception '교사 계정으로 로그인해야 사용할 수 있습니다.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.session_id_of(p_slug text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from public.class_sessions where slug = p_slug;
  if v_id is null then
    raise exception '수업 정보를 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

-- 상품별 집계 ------------------------------------------------------------
create or replace function public.compute_tally(p_session uuid)
returns table (
  product_id uuid,
  group_no int,
  country_name text,
  country_code text,
  theme_color text,
  sold int,
  student_sold int,
  parent_sold int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.group_no,
    p.country_name,
    p.country_code,
    p.theme_color,
    count(v.id)::int as sold,
    count(v.id) filter (where s.participant_type = 'student')::int as student_sold,
    count(v.id) filter (where s.participant_type = 'parent')::int as parent_sold
  from public.travel_products p
  left join public.vote_choices v on v.product_id = p.id
  left join public.purchase_submissions s on s.id = v.submission_id
  where p.session_id = p_session and p.is_active
  group by p.id, p.group_no, p.country_name, p.country_code, p.theme_color
  order by p.group_no;
$$;

-- 참여자/여행권 수 --------------------------------------------------------
create or replace function public.compute_counts(p_session uuid)
returns table (
  student_participants int,
  parent_participants int,
  total_participants int,
  student_tickets int,
  parent_tickets int,
  issued_tickets int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (
    select
      count(*) filter (where participant_type = 'student')::int as s,
      count(*) filter (where participant_type = 'parent')::int as p
    from public.purchase_submissions
    where session_id = p_session
  )
  select
    c.s, c.p, c.s + c.p,
    c.s,            -- 학생 여행권 = 학생 참여자 수
    c.p * 2,        -- 학부모 여행권 = 학부모 참여자 수 × 2
    c.s + c.p * 2   -- 발행된 전체 여행권
  from c;
$$;

-- 순위(동점은 같은 순위, 다음 순위는 건너뜀) ------------------------------
create or replace function public.ranked_products(p_session uuid)
returns table (
  product_id uuid,
  group_no int,
  country_name text,
  country_code text,
  theme_color text,
  sold int,
  student_sold int,
  parent_sold int,
  rank int,
  share_percent numeric,
  tied boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t as (select * from public.compute_tally(p_session)),
       c as (select issued_tickets from public.compute_counts(p_session))
  select
    t.product_id, t.group_no, t.country_name, t.country_code, t.theme_color,
    t.sold, t.student_sold, t.parent_sold,
    rank() over (order by t.sold desc)::int as rank,
    case when c.issued_tickets > 0
         then round(t.sold::numeric * 100 / c.issued_tickets, 1)
         else 0 end as share_percent,
    (count(*) over (partition by t.sold)) > 1 as tied
  from t cross join c
  order by t.sold desc, t.group_no;
$$;

-- 공개 범위 판정 (순위 기준, 동점이면 경계에서 함께 공개) -----------------
create or replace function public.in_reveal_scope(
  p_rank int, p_sold int, p_scope public.reveal_scope
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_scope
    when 'all'  then true
    when 'top1' then p_rank <= 1 and p_sold > 0
    when 'top2' then p_rank <= 2 and p_sold > 0
    when 'top3' then p_rank <= 3 and p_sold > 0
    else false
  end;
$$;

-- 공개 결과 JSON 만들기 (공개 결과 · 관리자 미리보기가 같은 함수를 쓴다) --
-- read-only 트랜잭션에서도 동작하도록 임시 테이블 없이 CTE 로만 구성한다.
create or replace function public.build_results(
  p_session uuid, p_scope public.reveal_scope, p_phase public.session_phase
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with counts as (
    select * from public.compute_counts(p_session)
  ),
  ranked as (
    select * from public.ranked_products(p_session)
  ),
  totals as (
    select coalesce(sum(sold), 0)::int as total_sold, count(*)::int as product_count
    from ranked
  ),
  -- 공개 범위 안의 상품 (판매량이 전부 0이면 억지로 1위를 만들지 않는다)
  rev as (
    select r.*
    from ranked r, totals t
    where t.total_sold > 0
      and public.in_reveal_scope(r.rank, r.sold, p_scope)
  ),
  revealed_json as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_id', rev.product_id,
            'group_no', rev.group_no,
            'country_name', rev.country_name,
            'country_code', rev.country_code,
            'theme_color', rev.theme_color,
            'sold', rev.sold,
            'student_sold', rev.student_sold,
            'parent_sold', rev.parent_sold,
            'rank', rev.rank,
            'share_percent', rev.share_percent,
            'tied', rev.tied
          ) order by rev.rank, rev.group_no
        ), '[]'::jsonb) as j,
      count(*)::int as n
    from rev
  ),
  -- 기대평: 구매에 포함된 상품이 "모두" 공개 범위 안일 때만 공개한다.
  -- (학부모 기대평은 두 상품이 모두 공개될 때 한 번만, 국가 태그 2개와 함께)
  visible_reviews as (
    select
      s.id, s.participant_type, s.review, s.created_at,
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'group_no', p.group_no,
                   'country_name', p.country_name,
                   'country_code', p.country_code
                 ) order by p.group_no)
        from public.vote_choices v2
        join public.travel_products p on p.id = v2.product_id
        where v2.submission_id = s.id
      ) as country_tags
    from public.purchase_submissions s
    where s.session_id = p_session
      and exists (select 1 from public.vote_choices v where v.submission_id = s.id)
      and not exists (
        select 1
        from public.vote_choices v
        where v.submission_id = s.id
          and v.product_id not in (select rev.product_id from rev)
      )
  ),
  reviews_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', vr.id,
          'participant_type', vr.participant_type::text,
          'review', vr.review,
          'country_tags', vr.country_tags
        ) order by vr.created_at
      ), '[]'::jsonb) as j
    from visible_reviews vr
  )
  select jsonb_build_object(
    'phase', p_phase::text,
    'reveal_scope', p_scope::text,
    'revealed', revealed_json.j,
    'hidden_count', totals.product_count - revealed_json.n,
    'student_participants', counts.student_participants,
    'parent_participants', counts.parent_participants,
    'total_participants', counts.total_participants,
    'issued_tickets', counts.issued_tickets,
    'reviews', reviews_json.j,
    'empty', totals.total_sold = 0
  )
  from counts, totals, revealed_json, reviews_json;
$$;

-- ---------------------------------------------------------------------------
-- 공개 RPC (anon 호출 가능)
-- ---------------------------------------------------------------------------

-- 현재 공개 가능한 수업 상태 + 상품 목록
create or replace function public.get_public_session(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s public.class_sessions%rowtype;
begin
  select * into v_s from public.class_sessions where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'slug', v_s.slug,
    'title', v_s.title,
    'subtitle', v_s.subtitle,
    'tagline', v_s.tagline,
    'phase', v_s.phase::text,
    -- 공개 범위는 revealed 상태에서만 내려 준다
    'reveal_scope', case when v_s.phase = 'revealed' then v_s.reveal_scope::text else 'none' end,
    'student_capacity', v_s.student_capacity,
    'updated_at', v_s.updated_at,
    'products', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', p.id, 'group_no', p.group_no, 'country_name', p.country_name,
          'country_code', p.country_code, 'display_order', p.display_order,
          'tagline', p.tagline, 'image_url', p.image_url,
          'theme_color', p.theme_color, 'is_active', p.is_active
        ) order by p.display_order, p.group_no), '[]'::jsonb)
      from public.travel_products p
      where p.session_id = v_s.id and p.is_active
    )
  );
end;
$$;

-- 학생 번호+이름 확인 후 임시 참여 토큰 발급
create or replace function public.issue_student_pass(
  p_slug text, p_student_no int, p_student_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session uuid;
  v_row public.student_roster%rowtype;
  v_pass public.access_passes%rowtype;
  v_token text;
begin
  v_session := public.session_id_of(p_slug);

  select * into v_row
  from public.student_roster r
  where r.session_id = v_session
    and r.student_no = p_student_no
    and r.is_active
    and public.norm_name(r.student_name) = public.norm_name(p_student_name)
  for update;

  if not found then
    raise exception '번호와 이름이 명단과 달라요. 다시 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  if v_row.pass_id is not null then
    select * into v_pass from public.access_passes where id = v_row.pass_id for update;
    if found and v_pass.is_used then
      raise exception '이미 구매를 마쳤어요. 다시 참여할 수는 없어요.'
        using errcode = 'P0001';
    end if;
    if found then
      -- 아직 쓰지 않은 참여권이면 토큰만 새로 발급(기기 변경 대비)
      update public.access_passes
        set token_hash = public.hash_token(v_token), issued_at = now()
        where id = v_pass.id;
      return jsonb_build_object('token', v_token, 'display_name', v_row.student_name);
    end if;
  end if;

  insert into public.access_passes (session_id, participant_type, token_hash)
  values (v_session, 'student', public.hash_token(v_token))
  returning * into v_pass;

  update public.student_roster set pass_id = v_pass.id where id = v_row.id;

  return jsonb_build_object('token', v_token, 'display_name', v_row.student_name);
end;
$$;

-- 학부모 공통 코드 확인 후 브라우저용 참여 토큰 발급
create or replace function public.issue_parent_pass(
  p_slug text, p_code text, p_browser_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_s public.class_sessions%rowtype;
  v_pass public.access_passes%rowtype;
  v_token text;
  v_bkey text;
begin
  select * into v_s from public.class_sessions where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  if v_s.parent_code_hash is null
     or v_s.parent_code_hash <> crypt(public.norm_code(p_code), v_s.parent_code_hash) then
    raise exception '참여 코드가 달라요. 화면에 안내된 코드를 다시 확인해 주세요.'
      using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_browser_key), '') = '' then
    raise exception '브라우저를 확인할 수 없어요. 새로고침 후 다시 시도해 주세요.'
      using errcode = 'P0001';
  end if;

  v_bkey := public.hash_token(p_browser_key);
  v_token := encode(gen_random_bytes(24), 'hex');

  select * into v_pass
  from public.access_passes
  where session_id = v_s.id and participant_type = 'parent' and browser_key_hash = v_bkey
  for update;

  if found then
    if v_pass.is_used then
      raise exception '이 기기에서는 이미 구매를 마쳤어요.' using errcode = 'P0001';
    end if;
    update public.access_passes
      set token_hash = public.hash_token(v_token), issued_at = now()
      where id = v_pass.id;
    return jsonb_build_object('token', v_token);
  end if;

  insert into public.access_passes
    (session_id, participant_type, token_hash, browser_key_hash)
  values (v_s.id, 'parent', public.hash_token(v_token), v_bkey);

  return jsonb_build_object('token', v_token);
end;
$$;

-- 구매 제출 (참여권 확인 → 상태 확인 → 저장 → 참여권 사용 처리, 단일 트랜잭션)
create or replace function public.submit_purchase(
  p_token text, p_product_ids uuid[], p_review text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pass public.access_passes%rowtype;
  v_phase public.session_phase;
  v_review text;
  v_ids uuid[];
  v_expected int;
  v_valid int;
  v_sub public.purchase_submissions%rowtype;
begin
  -- 참여권을 "사용 완료"로 바꾸면서 동시에 잠근다.
  -- 동시에 들어온 두 번째 요청은 여기서 걸러진다(중복 제출 방지).
  update public.access_passes
    set is_used = true, used_at = now()
    where token_hash = public.hash_token(p_token) and is_used = false
    returning * into v_pass;

  if not found then
    if exists (select 1 from public.access_passes where token_hash = public.hash_token(p_token)) then
      raise exception '이미 구매를 마쳤어요.' using errcode = 'P0001';
    end if;
    raise exception '참여권을 확인할 수 없어요. 처음 화면부터 다시 들어와 주세요.'
      using errcode = 'P0001';
  end if;

  select phase into v_phase from public.class_sessions where id = v_pass.session_id for share;
  if v_phase = 'waiting' then
    raise exception '아직 구매가 시작되지 않았어요.' using errcode = 'P0001';
  elsif v_phase <> 'open' then
    raise exception '구매가 마감되었어요. 결과 발표를 기다려 주세요.' using errcode = 'P0001';
  end if;

  -- 중복 제거한 선택 목록
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_product_ids, '{}'::uuid[])) x;
  v_ids := coalesce(v_ids, '{}');

  v_expected := case when v_pass.participant_type = 'student' then 1 else 2 end;

  if array_length(p_product_ids, 1) is distinct from array_length(v_ids, 1) then
    raise exception '같은 여행 상품을 두 번 고를 수는 없어요.' using errcode = 'P0001';
  end if;

  if coalesce(array_length(v_ids, 1), 0) <> v_expected then
    if v_pass.participant_type = 'student' then
      raise exception '학생은 여행 상품을 하나만 고를 수 있어요.' using errcode = 'P0001';
    else
      raise exception '서로 다른 여행 상품 2개를 골라 주세요.' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into v_valid
  from public.travel_products p
  where p.id = any (v_ids) and p.session_id = v_pass.session_id and p.is_active;

  if v_valid <> v_expected then
    raise exception '고른 여행 상품을 찾을 수 없어요.' using errcode = 'P0001';
  end if;

  v_review := btrim(coalesce(p_review, ''));
  if char_length(regexp_replace(v_review, '\s', '', 'g')) < 2 then
    raise exception '기대평은 공백을 빼고 2글자 이상 적어 주세요.' using errcode = 'P0001';
  end if;
  if char_length(v_review) > 80 then
    raise exception '기대평은 80글자까지 쓸 수 있어요.' using errcode = 'P0001';
  end if;

  insert into public.purchase_submissions (session_id, participant_type, review)
  values (v_pass.session_id, v_pass.participant_type, v_review)
  returning * into v_sub;

  insert into public.vote_choices (submission_id, product_id)
  select v_sub.id, x from unnest(v_ids) x;

  return jsonb_build_object(
    'submission_id', v_sub.id,
    'participant_type', v_sub.participant_type::text,
    'review', v_sub.review,
    'created_at', v_sub.created_at,
    'product_ids', to_jsonb(v_ids)
  );
end;
$$;

-- 공개 결과 조회 (revealed 상태 + 공개 범위를 서버에서 검사)
create or replace function public.get_public_results(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s public.class_sessions%rowtype;
begin
  select * into v_s from public.class_sessions where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  if v_s.phase <> 'revealed' then
    raise exception '결과는 아직 공개되지 않았어요.' using errcode = 'P0001';
  end if;

  return public.build_results(v_s.id, v_s.reveal_scope, v_s.phase);
end;
$$;

-- ---------------------------------------------------------------------------
-- 교사(관리자) 전용 RPC
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_tally(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.class_sessions%rowtype;
  v_c record;
begin
  perform public.require_admin();
  select * into v_s from public.class_sessions where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select * into v_c from public.compute_counts(v_s.id);

  return jsonb_build_object(
    'phase', v_s.phase::text,
    'reveal_scope', v_s.reveal_scope,
    'student_capacity', v_s.student_capacity,
    'student_participants', v_c.student_participants,
    'parent_participants', v_c.parent_participants,
    'total_participants', v_c.total_participants,
    'student_tickets', v_c.student_tickets,
    'parent_tickets', v_c.parent_tickets,
    'issued_tickets', v_c.issued_tickets,
    'counted_at', now(),
    'products', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'product_id', t.product_id, 'group_no', t.group_no,
          'country_name', t.country_name, 'country_code', t.country_code,
          'theme_color', t.theme_color, 'sold', t.sold,
          'student_sold', t.student_sold, 'parent_sold', t.parent_sold
        ) order by t.group_no), '[]'::jsonb)
      from public.compute_tally(v_s.id) t
    )
  );
end;
$$;

-- 기대평 원본 (익명 · 개인 식별 정보 없음)
create or replace function public.admin_get_reviews(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_session uuid;
begin
  perform public.require_admin();
  v_session := public.session_id_of(p_slug);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'participant_type', s.participant_type::text,
        'review', s.review,
        'created_at', s.created_at,
        'product_ids', (
          select coalesce(jsonb_agg(v.product_id), '[]'::jsonb)
          from public.vote_choices v where v.submission_id = s.id
        )
      ) order by s.created_at), '[]'::jsonb)
    from public.purchase_submissions s
    where s.session_id = v_session
  );
end;
$$;

-- 공개 미리보기 (실제 공개와 같은 build_results 사용)
create or replace function public.admin_preview_results(
  p_slug text, p_scope public.reveal_scope
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_s public.class_sessions%rowtype;
begin
  perform public.require_admin();
  select * into v_s from public.class_sessions where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  return public.build_results(v_s.id, p_scope, v_s.phase);
end;
$$;

create or replace function public.admin_set_phase(
  p_slug text, p_phase public.session_phase
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_s public.class_sessions%rowtype;
begin
  perform public.require_admin();
  update public.class_sessions
    set phase = p_phase,
        -- 결과 공개 상태를 벗어나면 공개 범위는 초기화한다
        reveal_scope = case when p_phase = 'revealed' then reveal_scope else 'none' end,
        updated_at = now()
    where slug = p_slug
    returning * into v_s;

  if not found then
    raise exception '수업 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('phase', v_s.phase::text, 'reveal_scope', v_s.reveal_scope);
end;
$$;

create or replace function public.admin_set_reveal_scope(
  p_slug text, p_scope public.reveal_scope
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_s public.class_sessions%rowtype;
begin
  perform public.require_admin();
  update public.class_sessions
    set reveal_scope = p_scope, updated_at = now()
    where slug = p_slug
    returning * into v_s;

  if not found then
    raise exception '수업 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('phase', v_s.phase::text, 'reveal_scope', v_s.reveal_scope);
end;
$$;

-- 리허설 데이터 초기화
--   p_keep_roster = true  : 학생 명단은 그대로 두고 구매/참여 상태만 초기화(기본)
--   p_keep_roster = false : 학생 명단까지 삭제
create or replace function public.admin_reset(
  p_slug text, p_keep_roster boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_session uuid;
  v_deleted int;
begin
  perform public.require_admin();
  v_session := public.session_id_of(p_slug);

  delete from public.purchase_submissions where session_id = v_session; -- vote_choices는 cascade
  get diagnostics v_deleted = row_count;

  update public.student_roster set pass_id = null where session_id = v_session;
  delete from public.access_passes where session_id = v_session;

  if not p_keep_roster then
    delete from public.student_roster where session_id = v_session;
  end if;

  update public.class_sessions
    set phase = 'waiting', reveal_scope = 'none', updated_at = now()
    where id = v_session;

  return jsonb_build_object('deleted_submissions', v_deleted, 'kept_roster', p_keep_roster);
end;
$$;

-- 학부모 공통 코드 설정 (교사만, 평문은 저장하지 않는다)
create or replace function public.admin_set_parent_code(p_slug text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_code, ''))) < 4 then
    raise exception '참여 코드는 4글자 이상으로 정해 주세요.' using errcode = 'P0001';
  end if;
  update public.class_sessions
    set parent_code_hash = crypt(public.norm_code(p_code), gen_salt('bf')),
        updated_at = now()
    where slug = p_slug;
  if not found then
    raise exception '수업 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 권한 (GRANT / REVOKE)
--   * 테이블 직접 접근은 anon/authenticated 모두 차단
--   * 필요한 RPC만 EXECUTE 허용 (내부 헬퍼는 허용하지 않는다)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- 참여자용
grant execute on function public.get_public_session(text) to anon, authenticated;
grant execute on function public.issue_student_pass(text, int, text) to anon, authenticated;
grant execute on function public.issue_parent_pass(text, text, text) to anon, authenticated;
grant execute on function public.submit_purchase(text, uuid[], text) to anon, authenticated;
grant execute on function public.get_public_results(text) to anon, authenticated;

-- 교사용 (로그인한 사용자만 호출 가능 + 함수 내부에서 admin allowlist 재확인)
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.admin_get_tally(text) to authenticated;
grant execute on function public.admin_get_reviews(text) to authenticated;
grant execute on function public.admin_preview_results(text, public.reveal_scope) to authenticated;
grant execute on function public.admin_set_phase(text, public.session_phase) to authenticated;
grant execute on function public.admin_set_reveal_scope(text, public.reveal_scope) to authenticated;
grant execute on function public.admin_reset(text, boolean) to authenticated;
grant execute on function public.admin_set_parent_code(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (교사 상태 변경이 참여자 화면에 즉시 반영되도록)
--   Supabase 대시보드 > Database > Replication 에서 켜도 됩니다.
--   RLS 정책이 없으므로 행 내용 자체는 클라이언트로 내려가지 않고
--   "변경이 있었다"는 신호만 쓰며, 실제 데이터는 RPC로 다시 조회합니다.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.class_sessions;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.purchase_submissions;
exception when duplicate_object then null; when undefined_object then null; end $$;
