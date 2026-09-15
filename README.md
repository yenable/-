# 돌멩홈쇼핑 · 세계 여행 특가전

초등학교 공개수업용 **실시간 여행 상품 구매(투표) 사이트**입니다.
학생 5개 모둠이 만든 여행 상품(덴마크 · 일본 · 필리핀 · 캐나다 · 사우디아라비아)을
학생 18명과 학부모가 휴대전화로 "구매"하고, 교사가 결과 공개 범위를 정해 발표합니다.

> 이 사이트의 구매는 수업용 가상 체험이며 실제 결제가 이루어지지 않습니다.

수업 몰입을 위해 화면에서는 다음 용어를 씁니다.
투표 → **여행 상품 구매** / 득표수 → **판매된 여행권 수** / 투표 완료 → **구매 완료** / 결과 → **판매 결과**

---

## 1. 빠르게 실행하기 (Supabase 없이 demo mode)

```bash
npm install
npm run dev
```

- 참여자 화면: <http://localhost:5173/>
- 교사 화면: <http://localhost:5173/admin>

`.env` 파일이 없으면 자동으로 **demo mode**로 뜹니다(화면 위에 `DEMO` 배지).
demo mode의 데이터는 그 브라우저의 localStorage에만 저장되고 실제 DB와 완전히 분리됩니다.

### demo mode 체험용 값

| 항목 | 값 |
| --- | --- |
| 학생 번호 | 1 ~ 18 |
| 학생 이름 | `체험1` ~ `체험18` (번호와 이름이 맞아야 입장) |
| 학부모 참여 코드 | `TRAVEL` |
| 교사 로그인 | 아무 이메일 + `데모 교사로 바로 로그인` 버튼 |

### demo mode 진입 방법

1. `.env` 없이 실행 (자동 demo)
2. `.env` 에 `VITE_DEMO_MODE=true`
3. 개발 서버에서 `?demo=1` (`http://localhost:5173/?demo=1`)
   - 운영 빌드에서는 `VITE_ALLOW_DEMO_QUERY=true` 일 때만 동작합니다. 공개수업용 빌드에서는 끄세요.

### 교사 화면에서 리허설 데이터 만들기 (demo 전용)

`/admin` 아래쪽 **DEMO 데이터 만들기**에서 `보통 결과 / 공동 1위 / 경계 동점(TOP 2) / 0장 상품 포함`
버튼으로 상황을 만들어 공개 범위·동점 처리를 미리 연습할 수 있습니다.

---

## 2. 테스트

```bash
npm test          # 집계 · 순위 · 동점 · 공개 범위 · 제출 규칙 자동 테스트 (61개)
npm run typecheck # 타입 검사
npm run build     # 타입 검사 + 프로덕션 빌드
```

실제 브라우저(Chromium)로 전체 수업 흐름을 검증하려면 — 다른 터미널에서 `npm run dev` 를 켠 상태에서:

```bash
npm i -D playwright && npx playwright install chromium
npm run test:browser   # 69개 항목 검증 + .verify-shots/ 에 화면 크기별 스크린샷 저장
```

DB(SQL) 쪽 검증까지 하려면:

```bash
npm i -D @electric-sql/pglite
npm run test:sql  # 마이그레이션을 실제 Postgres(WASM)에 적용하고 74개 시나리오 검증
```

---

## 3. 실제 Supabase 연결하기

### 3-1. 환경 변수

`.env.example` 을 복사해 `.env` 를 만듭니다.

```bash
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | anon(public) key — 브라우저에 노출되어도 되는 키 |
| `VITE_SESSION_SLUG` | 수업 세션 슬러그(기본 `default`) |
| `VITE_DEMO_MODE` | `false` (실제 운영) |
| `VITE_ALLOW_DEMO_QUERY` | `false` (운영 빌드에서 `?demo=1` 차단) |

> ⚠️ **service_role key는 절대 `.env`(VITE_*)에 넣지 마세요.** 브라우저 번들에 포함됩니다.
> 학부모 참여 코드와 교사 비밀번호도 코드/환경 변수가 아니라 DB와 Supabase Auth에 저장합니다.

### 3-2. 마이그레이션 적용

Supabase 대시보드 → **SQL Editor** 에 아래 파일 내용을 붙여넣고 차례로 실행합니다.

1. `supabase/migrations/0001_init.sql` — 테이블 · RLS · GRANT · RPC
2. `supabase/seed/01_session_and_products.sql` — 수업 세션 + 여행 상품 5개
3. `supabase/seed/02_student_roster_template.sql` — **학생 18명 명단(이름을 실제 이름으로 바꿔서)**
4. `supabase/seed/03_parent_code_and_admin.sql` — 학부모 참여 코드 + 교사 계정 등록
5. (선택) `supabase/seed/04_rehearsal_tie_data.sql` — 리허설용 동점 데이터

Supabase CLI를 쓴다면:

```bash
supabase link --project-ref <YOUR-PROJECT-REF>
supabase db push          # supabase/migrations 적용
```

### 3-3. 학생 명단 입력

- `supabase/seed/02_student_roster_template.sql` 의 `'학생01이름'` ~ `'학생18이름'` 을 실제 이름으로 바꿔 실행합니다.
- 스프레드시트로 관리하려면 `supabase/seed/02_student_roster_template.csv` 를 채운 뒤
  Supabase 대시보드 → Table Editor → `student_roster` → Import CSV 로 올리고,
  `session_id` 컬럼만 아래 쿼리로 채워 주세요.

```sql
update public.student_roster set session_id = (select id from public.class_sessions where slug='default')
 where session_id is null;
```

- 이름 비교는 **공백을 무시**합니다(`김 하늘` = `김하늘`).
- 전학·결석 등으로 빠지는 학생은 지우지 말고 `is_active = false` 로 두세요.

### 3-4. 학부모 공통 코드 설정

`supabase/seed/03_parent_code_and_admin.sql` 의 `'TRAVEL2026'` 부분만 원하는 코드로 바꿔 실행합니다.
코드 원문은 저장되지 않고 **bcrypt 해시**만 저장됩니다. 입력할 때 공백·대소문자는 무시됩니다.

수업 중에 코드를 바꾸고 싶다면 교사 계정으로 로그인한 상태에서:

```sql
select public.admin_set_parent_code('default', '새코드');
```

### 3-5. 교사 계정 설정

1. Supabase 대시보드 → **Authentication → Users → Add user** 로 교사 계정(이메일 + 비밀번호) 생성
2. `supabase/seed/03_parent_code_and_admin.sql` 의 이메일을 바꿔 실행 → `admin_users` allowlist 등록
3. `/admin` 에서 그 계정으로 로그인

관리자 UID·비밀번호는 소스 코드 어디에도 들어 있지 않습니다. 관리자 판단은 서버(`public.is_admin_user()`)에서만 합니다.

### 3-6. Realtime

마이그레이션이 `class_sessions`, `purchase_submissions` 를 `supabase_realtime` publication 에 추가합니다.
막혀 있어도 4초 주기 폴링이 함께 돌기 때문에 화면 전환은 정상 동작합니다.
(대시보드 → Database → Replication 에서 확인 가능)

---

## 4. URL 구조

| 경로 | 용도 |
| --- | --- |
| `/` | 참여자(학생·학부모) 화면 — QR코드는 이 주소로 만드세요 |
| `/admin` | 교사용 관리자 화면 (Supabase Auth 로그인 필요) |
| `/?demo=1` | demo mode (개발 서버 또는 `VITE_ALLOW_DEMO_QUERY=true` 일 때만) |

> 정적 호스팅(Netlify/Vercel/Cloudflare Pages 등)에 올릴 때는 SPA 라우팅을 위해
> 모든 경로를 `index.html` 로 rewrite 하도록 설정하세요. (`/admin` 직접 접속용)

---

## 5. 수업 진행 흐름

| 상태 | 참여자 화면 | 교사 |
| --- | --- | --- |
| `waiting` | "여행 상품 발표를 모두 들은 뒤 구매가 시작됩니다." (미리 입장 가능) | 입장만 열어 둔 상태 |
| `open` | 상품 5개 선택 + 기대평 + 구매 | 실시간 현황을 교사만 확인 |
| `closed` | "구매가 마감되었습니다. 곧 결과를 공개합니다." | 전체 순위 확인 후 공개 범위 결정 |
| `revealed` | 판매 결과 화면으로 **자동 전환** | 공개 범위 조정 가능 |

공개 범위: `1위만 / TOP 2 / TOP 3 / 전체 순위`
→ **개수가 아니라 순위 기준**이라 공동 1위가 둘이면 "1위만 공개"에서도 둘 다 공개됩니다.
관리자 미리보기에서 "동점으로 N개 추가 공개"를 미리 알려 줍니다.

---

## 6. 집계 기준

- **참여자 수** = 실제 구매를 완료한 사람 수
- **발행 여행권 수** = 학생 참여자 수 + 학부모 참여자 수 × 2
- **상품별 판매량** = 그 상품에 배정된 여행권 수
- 비율은 참여자 수가 아니라 **전체 발행 여행권 수**를 기준으로 계산합니다.

예) 학생 18명 + 학부모 7명 → 참여자 25명 / 학생 여행권 18장 / 학부모 여행권 14장 / **총 32장**

---

## 7. 개인정보 · 익명성 처리

| 항목 | 처리 방식 |
| --- | --- |
| 학생 명단 | `student_roster` — RLS로 클라이언트 조회 전면 차단. 서버 RPC에서만 번호+이름을 대조 |
| 참여권 | `access_passes` — 임시 토큰의 **SHA-256 해시만** 저장(원문 저장 안 함) |
| 구매 기록 | `purchase_submissions` — 학생 번호·이름 컬럼 없음, 참여권과 연결되는 외래키 없음 |
| 선택 | `vote_choices` — 익명 구매 ID ↔ 상품 ID만 연결 |
| 학부모 | 이름·전화번호·이메일을 받지 않음. 공통 코드는 bcrypt 해시로만 저장 |
| 교사 | 개인별 선택 내역을 조회하는 기능 자체가 없음(RPC 미제공) |
| 기대평 | 항상 일반 텍스트로만 렌더링(React 기본 이스케이프). HTML로 해석하지 않음 |
| 결과 | `get_public_results` 가 서버에서 `revealed` 상태와 공개 범위를 검사 |
| 권한 | 모든 테이블 RLS 활성 + 정책 없음, `anon/authenticated` 테이블 GRANT 없음, RPC EXECUTE만 선별 허용 |
| 함수 | 모든 `SECURITY DEFINER` 함수에 고정 `search_path` 설정 |

### 알려진 한계 (꼭 확인하세요)

- **학부모 참여 제한은 완벽하지 않습니다.** 공통 코드는 여러 사람이 함께 쓰는 값이고,
  중복 참여 제한은 "같은 브라우저(localStorage 기반 임시 키)" 기준이라
  **시크릿 모드·다른 브라우저·다른 기기에서는 다시 참여할 수 있습니다.**
  교실에서 눈으로 보며 진행하는 수업용 장치이지, 엄밀한 1인 1표 보장 장치가 아닙니다.
- 학생 참여는 명단 대조 + 1인 1참여권이라 더 엄격하지만, 다른 학생의 번호·이름을 알고 있다면
  대신 입장할 수 있습니다(교실에서 함께 진행하는 것을 전제로 합니다).
- 교사가 개인별 선택을 볼 수 없으므로, 특정 학생의 참여 여부만 따로 확인할 수는 없습니다(의도된 설계입니다).

---

## 8. 상품 소개 문구 · 대표 사진 바꾸기

각 모둠의 실제 상품명·코스·소개 문구·사진은 아직 정해지지 않아 **자리표시자**로 두었습니다.

- demo mode: `src/lib/products.ts`
- 실제 DB: `travel_products` 테이블의 `tagline`, `image_url` (예시 SQL은 `supabase/seed/01_session_and_products.sql` 아래쪽 주석)

`image_url` 이 비어 있으면 국가 테마색 기반의 SVG 일러스트가 자동으로 대신 보입니다.

---

## 9. 프로젝트 구조

```
src/
  lib/
    ranking.ts        순위 · 동점 · 공개 범위 · 기대평 공개 규칙 (모든 화면이 공유)
    validation.ts     기대평/선택 개수 검사 (DB와 같은 규칙)
    products.ts       모둠·국가 기본 데이터
    config.ts         환경 변수 / demo mode 판별
    backend/
      types.ts        demo · supabase 공통 인터페이스
      demo.ts         localStorage 기반 demo 구현 (탭 간 동기화 포함)
      supabase.ts     Supabase RPC 구현
  components/         Header · ProductCard · ResultsView · 공통 UI
  screens/            Entry / Purchase / Participant(대기·티켓·결과) / Admin
  test/               자동 테스트 (ranking · validation · flow)
supabase/
  migrations/0001_init.sql   테이블 · RLS · GRANT · RPC
  seed/                      세션/상품, 학생 명단, 코드·교사, 리허설 데이터
scripts/test-sql.mjs         마이그레이션 SQL 자동 검증(PGlite)
docs/CLASS_DAY_CHECKLIST.md  공개수업 당일 운영 체크리스트
```

---

## 10. 기술 스택

Vite 5 + React 18 + TypeScript (UI 라이브러리 없이 순수 CSS), Vitest,
`@supabase/supabase-js` (실제 연동 시), 외부 폰트·이미지 의존성 없음.
