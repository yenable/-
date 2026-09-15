/**
 * [실행]  npm run test:sql   (먼저: npm i -D @electric-sql/pglite)
 *
 * supabase/migrations/0001_init.sql 을 실제 Postgres(PGlite/WASM)에서 실행하고
 * 핵심 시나리오를 검증한다. (Supabase 전용 객체는 최소한의 shim 으로 대체)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(url.fileURLToPath(new URL('.', import.meta.url)), '..');
const SQL_PATH = path.join(ROOT, 'supabase/migrations/0001_init.sql');
const SEED_PATH = path.join(ROOT, 'supabase/seed/01_session_and_products.sql');

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}
async function expectError(db, fn, contains, name) {
  try {
    await fn();
    check(name, false, '(오류가 발생하지 않음)');
  } catch (e) {
    check(name, String(e.message).includes(contains), `-> ${e.message}`);
  }
}

let PGlite, pgcrypto;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  console.log('SQL 검증에는 PGlite(WASM Postgres)가 필요합니다.');
  console.log('  npm i -D @electric-sql/pglite');
  console.log('설치 후 다시 실행해 주세요: npm run test:sql');
  process.exit(0);
}

const db = new PGlite({ extensions: { pgcrypto } });
await db.waitReady;

// --- Supabase shim (auth 스키마 / 역할) ---
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text);
  create table if not exists auth._ctx (uid uuid);
  insert into auth._ctx values (null);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select uid from auth._ctx limit 1;
  $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
`);

let sql = fs.readFileSync(SQL_PATH, 'utf8');
// PGlite 에는 supabase_realtime publication 이 없다 (마이그레이션은 예외를 삼키지만 확실히 제외)
sql = sql.split('-- Realtime (교사 상태 변경이')[0];

try {
  await db.exec(sql);
  check('마이그레이션 SQL 전체 실행', true);
} catch (e) {
  check('마이그레이션 SQL 전체 실행', false, `-> ${e.message}`);
  process.exit(1);
}

await db.exec(fs.readFileSync(SEED_PATH, 'utf8'));
check('seed(세션+상품 5개) 실행', true);

const products = (
  await db.query(
    `select p.id, p.group_no from public.travel_products p
     join public.class_sessions s on s.id = p.session_id
     where s.slug='default' order by group_no`,
  )
).rows;
check('상품 5개 생성', products.length === 5, `-> ${products.length}`);

// 학생 명단 (테스트용 자리표시자 이름)
await db.exec(`
  insert into public.student_roster (session_id, student_no, student_name)
  select s.id, g, '체험' || g from public.class_sessions s, generate_series(1,18) g
  where s.slug='default';
`);

// 학부모 코드 + 관리자
await db.exec(`
  update public.class_sessions
     set parent_code_hash = crypt(upper('TRAVEL2026'), gen_salt('bf'))
   where slug='default';
  insert into auth.users values ('11111111-1111-1111-1111-111111111111','teacher@school.example');
  insert into public.admin_users (user_id, note) values ('11111111-1111-1111-1111-111111111111','담임');
`);

const asTeacher = () => db.exec(`update auth._ctx set uid = '11111111-1111-1111-1111-111111111111'`);
const asAnon = () => db.exec(`update auth._ctx set uid = null`);

const rpc = async (name, args = []) => {
  const params = args.map((_, i) => `$${i + 1}`).join(',');
  const r = await db.query(`select public.${name}(${params}) as out`, args);
  return r.rows[0].out;
};

console.log('\n[1] 공개 세션 / 관리자 권한');
await asAnon();
const sess = await rpc('get_public_session', ['default']);
check('get_public_session: phase=waiting', sess.phase === 'waiting');
check('get_public_session: 상품 5개', sess.products.length === 5);
check('get_public_session: 자리표시자 tagline', sess.products[0].tagline.includes('자리표시자'));

await expectError(db, () => rpc('admin_get_tally', ['default']), '교사 계정', '비로그인 사용자의 admin_get_tally 차단');
await expectError(db, () => rpc('admin_set_phase', ['default', 'open']), '교사 계정', '비로그인 사용자의 상태 변경 차단');
await expectError(db, () => rpc('admin_preview_results', ['default', 'all']), '교사 계정', '비로그인 사용자의 미리보기 차단');
await expectError(db, () => rpc('admin_reset', ['default', true]), '교사 계정', '비로그인 사용자의 초기화 차단');
await expectError(db, () => rpc('get_public_results', ['default']), '아직 공개', 'revealed 전 공개결과 RPC 차단');

console.log('\n[2] 입장 / 명단 확인');
const p1 = await rpc('issue_student_pass', ['default', 1, '체험1']);
check('학생 참여권 발급', typeof p1.token === 'string' && p1.token.length === 48);
const p1again = await rpc('issue_student_pass', ['default', 1, ' 체험1 ']);
check('공백 무시한 이름 대조', typeof p1again.token === 'string');
await expectError(db, () => rpc('issue_student_pass', ['default', 1, '체험2']), '명단과 달라요', '번호/이름 불일치 차단');
await expectError(db, () => rpc('issue_student_pass', ['default', 99, '체험99']), '명단과 달라요', '명단에 없는 번호 차단');
await expectError(db, () => rpc('issue_parent_pass', ['default', 'WRONG', 'b1']), '참여 코드가 달라요', '잘못된 학부모 코드 차단');
const par1 = await rpc('issue_parent_pass', ['default', ' travel2026 ', 'browser-1']);
check('학부모 코드 정규화(공백/소문자)', typeof par1.token === 'string');

console.log('\n[3] waiting 상태에서 제출 차단');
await expectError(
  db,
  () => rpc('submit_purchase', [p1again.token, [products[0].id], '기대돼요']),
  '아직 구매가 시작',
  'waiting 상태 제출 차단',
);

console.log('\n[4] 구매 시작 후 제출');
await asTeacher();
await rpc('admin_set_phase', ['default', 'open']);
await asAnon();

const r1 = await rpc('submit_purchase', [p1again.token, [products[0].id], '덴마크 가고 싶어요']);
check('학생 구매 저장', r1.participant_type === 'student' && r1.product_ids.length === 1);
await expectError(
  db,
  () => rpc('submit_purchase', [p1again.token, [products[0].id], '또 살래요']),
  '이미 구매를 마쳤어요',
  '같은 참여권 재사용 차단',
);
await expectError(db, () => rpc('issue_student_pass', ['default', 1, '체험1']), '이미 구매를 마쳤어요', '구매 완료 학생 재입장 차단');
await expectError(db, () => rpc('submit_purchase', ['가짜토큰', [products[0].id], '기대돼요']), '참여권을 확인할 수 없어요', '위조 토큰 차단');

const p2 = await rpc('issue_student_pass', ['default', 2, '체험2']);
await expectError(
  db,
  () => rpc('submit_purchase', [p2.token, [products[0].id, products[1].id], '둘 다요']),
  '하나만 고를 수 있어요',
  '학생 2개 선택 차단',
);
await expectError(
  db,
  () => rpc('submit_purchase', [p2.token, [products[0].id], '가']),
  '2글자 이상',
  '기대평 최소 길이 검사',
);
await expectError(
  db,
  () => rpc('submit_purchase', [p2.token, [products[0].id], '가'.repeat(81)]),
  '80글자까지',
  '기대평 최대 길이 검사',
);
const stillUsable = await rpc('submit_purchase', [p2.token, [products[1].id], '일본 기대돼요']);
check('실패한 제출은 참여권을 소모하지 않음(롤백)', Boolean(stillUsable.submission_id));

await expectError(
  db,
  () => rpc('submit_purchase', [par1.token, [products[0].id, products[0].id], '같은 상품']),
  '두 번 고를 수는 없어요',
  '학부모 같은 상품 중복 선택 차단',
);
await expectError(
  db,
  () => rpc('submit_purchase', [par1.token, [products[0].id], '하나만']),
  '서로 다른 여행 상품 2개',
  '학부모 1개 선택 차단',
);
const parentRes = await rpc('submit_purchase', [par1.token, [products[0].id, products[2].id], '두 곳 모두 좋아요']);
check('학부모 구매 저장(2개)', parentRes.product_ids.length === 2);
await expectError(db, () => rpc('issue_parent_pass', ['default', 'TRAVEL2026', 'browser-1']), '이미 구매를 마쳤어요', '같은 브라우저 학부모 재참여 차단');

console.log('\n[5] 집계 기준');
await asTeacher();
let tally = await rpc('admin_get_tally', ['default']);
check('학생 참여자 2명', tally.student_participants === 2, JSON.stringify(tally.student_participants));
check('학부모 참여자 1명', tally.parent_participants === 1);
check('총 참여자 3명', tally.total_participants === 3);
check('발행 여행권 = 학생2 + 학부모1×2 = 4장', tally.issued_tickets === 4, JSON.stringify(tally.issued_tickets));
check('학생표 2 / 학부모표 2', tally.student_tickets === 2 && tally.parent_tickets === 2);
const soldSum = tally.products.reduce((s, p) => s + p.sold, 0);
check('상품별 판매 합계 = 발행 여행권 수', soldSum === 4, `-> ${soldSum}`);
check('1모둠 학생1+학부모1', tally.products[0].student_sold === 1 && tally.products[0].parent_sold === 1);

console.log('\n[6] 나머지 학생 구매 + 동점 만들기');
// 목표: 1모둠 6, 2모둠 6, 3모둠 4, 4모둠 4, 5모둠 0 (공동 1위 / 공동 3위 / 0장)
// 시작 시점: 1모둠 2장(학생1+학부모1), 2모둠 1장, 3모둠 1장(학부모)
const plan = [
  [3, 0], [4, 0], [5, 0], [6, 0],                 // 1모둠 +4 => 6
  [7, 1], [8, 1], [9, 1], [10, 1], [11, 1],       // 2모둠 +5 => 6
  [12, 2], [13, 2], [14, 2],                      // 3모둠 +3 => 4
  [15, 3], [16, 3], [17, 3], [18, 3],             // 4모둠 +4 => 4
];
await asAnon();
for (const [no, idx] of plan) {
  const pass = await rpc('issue_student_pass', ['default', no, `체험${no}`]);
  await rpc('submit_purchase', [pass.token, [products[idx].id], `${no}번 고객의 기대평`]);
}
await asTeacher();
tally = await rpc('admin_get_tally', ['default']);
const sold = tally.products.map((p) => p.sold);
check('상품별 판매량 [6,6,4,4,0]', JSON.stringify(sold) === '[6,6,4,4,0]', `-> ${JSON.stringify(sold)}`);
check('총 참여자 19명 (학생 18 + 학부모 1)', tally.total_participants === 19);
check('발행 여행권 20장', tally.issued_tickets === 20);

console.log('\n[7] 순위 / 동점 / 공개 범위');
const ranked = (await db.query(`select * from public.ranked_products((select id from public.class_sessions where slug='default')) order by rank, group_no`)).rows;
check('경쟁식 순위 [1,1,3,3,5]', JSON.stringify(ranked.map((r) => r.rank)) === '[1,1,3,3,5]', JSON.stringify(ranked.map((r) => r.rank)));
check('공동 1위 tied=true', ranked[0].tied === true && ranked[1].tied === true);
check('비율은 발행 여행권 기준(6/20=30%)', Number(ranked[0].share_percent) === 30, String(ranked[0].share_percent));

const prev1 = await rpc('admin_preview_results', ['default', 'top1']);
check('1위만 공개 → 공동 1위 2개 공개', prev1.revealed.length === 2 && prev1.revealed.every((r) => r.rank === 1));
check('1위만 공개 → 숨김 3개', prev1.hidden_count === 3);

const prev2 = await rpc('admin_preview_results', ['default', 'top2']);
check('TOP 2 공개 → 공동 1위 2개만(2위 없음)', prev2.revealed.length === 2, JSON.stringify(prev2.revealed.map((r) => r.rank)));

const prev3 = await rpc('admin_preview_results', ['default', 'top3']);
check('TOP 3 공개 → 경계 동점으로 4개 공개', prev3.revealed.length === 4, JSON.stringify(prev3.revealed.map((r) => r.rank)));
check('TOP 3: 0장 상품은 공개하지 않음', prev3.revealed.every((r) => r.sold > 0));

const prevAll = await rpc('admin_preview_results', ['default', 'all']);
check('전체 공개 → 0장 상품 포함 5개', prevAll.revealed.length === 5);
check('전체 공개 → 숨김 0개', prevAll.hidden_count === 0);

console.log('\n[8] 기대평 공개 규칙');
const parentReview1 = prev1.reviews.filter((r) => r.participant_type === 'parent');
check('학부모가 고른 3모둠이 숨겨져 있으면 기대평도 숨김', parentReview1.length === 0, JSON.stringify(parentReview1));
const parentReviewAll = prevAll.reviews.filter((r) => r.participant_type === 'parent');
check('두 상품이 모두 공개되면 학부모 기대평 1번만 노출', parentReviewAll.length === 1);
check('학부모 기대평에 국가 태그 2개', parentReviewAll[0].country_tags.length === 2);
check('학생 기대평 국가 태그 1개', prevAll.reviews.find((r) => r.participant_type === 'student').country_tags.length === 1);
check('공개 범위 밖 기대평 제외(top1 기대평 수 < 전체)', prev1.reviews.length < prevAll.reviews.length);

console.log('\n[9] 마감 / 공개 / 미리보기 일치');
await rpc('admin_set_phase', ['default', 'closed']);
await asAnon();
await expectError(db, () => rpc('get_public_results', ['default']), '아직 공개', 'closed 상태에서 공개결과 차단');
const p19 = await rpc('issue_parent_pass', ['default', 'TRAVEL2026', 'browser-late']);
await expectError(
  db,
  () => rpc('submit_purchase', [p19.token, [products[0].id, products[1].id], '늦었어요']),
  '구매가 마감',
  '마감 후 제출 차단',
);

await asTeacher();
const preview = await rpc('admin_preview_results', ['default', 'top3']);
await rpc('admin_set_phase', ['default', 'revealed']);
await rpc('admin_set_reveal_scope', ['default', 'top3']);
await asAnon();
const actual = await rpc('get_public_results', ['default']);
check(
  '관리자 미리보기와 실제 공개 결과 일치',
  JSON.stringify(actual.revealed) === JSON.stringify(preview.revealed) &&
    JSON.stringify(actual.reviews) === JSON.stringify(preview.reviews),
);
const pubSession = await rpc('get_public_session', ['default']);
check('공개 세션에 공개 범위 반영', pubSession.reveal_scope === 'top3' && pubSession.phase === 'revealed');

console.log('\n[10] 공개 범위 축소/확대');
await asTeacher();
await rpc('admin_set_reveal_scope', ['default', 'all']);
await asAnon();
const widened = await rpc('get_public_results', ['default']);
check('범위를 넓히면 상품 5개 공개', widened.revealed.length === 5);
check('범위를 넓히면 숨어 있던 학부모 기대평 공개', widened.reviews.filter((r) => r.participant_type === 'parent').length === 1);

console.log('\n[11] 학생 명단 · 개인정보 보호');
const rosterLink = (
  await db.query(`
    select count(*)::int as n
    from information_schema.columns
    where table_schema='public' and table_name='purchase_submissions'
      and column_name in ('student_no','student_name','pass_id','access_pass_id','roster_id')
  `)
).rows[0].n;
check('구매 테이블에 학생 식별/참여권 연결 컬럼 없음', rosterLink === 0);
const grants = (
  await db.query(`
    select count(*)::int as n from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated')
  `)
).rows[0].n;
check('anon/authenticated 에 테이블 권한 없음', grants === 0, `-> ${grants}`);
const rls = (
  await db.query(`select count(*)::int as n from pg_tables where schemaname='public' and not rowsecurity`)
).rows[0].n;
check('public 스키마 모든 테이블 RLS 활성', rls === 0, `-> ${rls}`);
const policies = (await db.query(`select count(*)::int as n from pg_policies where schemaname='public'`)).rows[0].n;
check('RLS 정책 없음(직접 접근 전면 차단)', policies === 0);
const execGrant = (
  await db.query(`
    select count(*)::int as n from information_schema.role_routine_grants
    where routine_schema='public' and grantee='anon'
      and routine_name in ('admin_get_tally','admin_set_phase','admin_reset','admin_preview_results','compute_tally','build_results','ranked_products')
  `)
).rows[0].n;
check('anon 에게 관리자/내부 함수 EXECUTE 권한 없음', execGrant === 0, `-> ${execGrant}`);
const definerPaths = (
  await db.query(`
    select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and (p.proconfig is null or not exists (
      select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  `)
).rows[0].n;
check('모든 SECURITY DEFINER 함수에 고정 search_path 설정', definerPaths === 0, `-> ${definerPaths}`);

console.log('\n[12] 리허설 초기화');
await asTeacher();
const reset = await rpc('admin_reset', ['default', true]);
check('초기화 결과 보고', reset.deleted_submissions === 19, JSON.stringify(reset));
const after = await rpc('admin_get_tally', ['default']);
check('초기화 후 참여자 0명', after.total_participants === 0);
check('초기화 후 상태 waiting', after.phase === 'waiting' && after.reveal_scope === 'none');
const rosterLeft = (await db.query(`select count(*)::int as n from public.student_roster`)).rows[0].n;
check('학생 명단은 유지', rosterLeft === 18);
await asAnon();
const reentry = await rpc('issue_student_pass', ['default', 1, '체험1']);
check('초기화 후 같은 학생 재입장 가능', typeof reentry.token === 'string');

console.log('\n[13] 데이터가 하나도 없을 때');
await asTeacher();
await rpc('admin_set_phase', ['default', 'closed']);
const emptyPrev = await rpc('admin_preview_results', ['default', 'all']);
check('집계 없음 → empty=true, 공개 0개', emptyPrev.empty === true && emptyPrev.revealed.length === 0);
await rpc('admin_set_phase', ['default', 'revealed']);
await rpc('admin_set_reveal_scope', ['default', 'top1']);
await asAnon();
const emptyPub = await rpc('get_public_results', ['default']);
check('공개해도 억지 1위를 만들지 않음', emptyPub.empty === true && emptyPub.revealed.length === 0);

console.log(`\n===== SQL 검증 결과: ${pass} 통과 / ${fail} 실패 =====`);
process.exit(fail > 0 ? 1 : 0);
