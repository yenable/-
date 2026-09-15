/**
 * [실행] 1) 다른 터미널에서  npm run dev
 *        2) npm i -D playwright && npx playwright install chromium
 *        3) npm run test:browser
 *
 * demo mode 사이트를 실제 Chromium 으로 띄워 전체 수업 흐름을 검증하고
 * .verify-shots/ 에 화면 크기별 스크린샷을 남긴다.
 */
import fs from 'node:fs';

let chromium, devices;
try {
  ({ chromium, devices } = await import('playwright'));
} catch {
  console.log('브라우저 검증에는 Playwright가 필요합니다.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  console.log('그리고 다른 터미널에서 npm run dev 를 켠 뒤 실행하세요: npm run test:browser');
  process.exit(0);
}

const BASE = 'http://localhost:5173';
const SHOT = '.verify-shots'; // 검증 스크린샷 저장 위치(git 제외)
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const consoleErrors = [];
const log = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n} ${extra}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ko-KR' });

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
}

async function noHScroll(page, label) {
  const r = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  log(`가로 스크롤 없음 (${label}) ${r.sw}<=${r.cw}`, r.sw <= r.cw + 1, JSON.stringify(r));
}

const user = await ctx.newPage();
const admin = await ctx.newPage();
watch(user, 'user');
watch(admin, 'admin');

console.log('\n[A] 첫 화면 / 대기');
await user.goto(`${BASE}/?demo=1`);
await user.waitForSelector('text=어서 오세요!');
log('DEMO 배지 표시', await user.locator('.badge-demo').first().isVisible());
log('가상 체험 안내 문구 표시', (await user.locator('.disclaimer').innerText()).includes('실제 결제가 이루어지지 않습니다'));
log('학생/학부모 입장 버튼', await user.getByRole('button', { name: /학생으로 입장/ }).isVisible());
await noHScroll(user, '첫 화면 360px');
await user.screenshot({ path: `${SHOT}/01-entry-360.png`, fullPage: true });

await user.getByRole('button', { name: /학생으로 입장/ }).click();
await user.fill('#student-no', '1');
await user.fill('#student-name', '체험1');
await user.getByRole('button', { name: '입장하기' }).click();
await user.waitForSelector('text=여행 상품 발표를 모두 들은 뒤');
log('waiting: 사전 입장 후 대기 화면', true);
await user.screenshot({ path: `${SHOT}/02-waiting-360.png`, fullPage: true });

console.log('\n[B] 교사 로그인 / 구매 시작');
await admin.setViewportSize({ width: 1440, height: 900 });
await admin.goto(`${BASE}/admin?demo=1`);
await admin.waitForSelector('text=교사 로그인');
await admin.getByRole('button', { name: '데모 교사로 바로 로그인' }).click();
await admin.waitForSelector('text=실시간 판매 현황');
log('관리자: 로그인 후 현황 화면', true);
log('관리자 전용 안내 문구', (await admin.locator('.teacher-only').innerText()).includes('참여자 화면에는 아직 공개되지 않습니다'));
await admin.screenshot({ path: `${SHOT}/03-admin-waiting-1440.png`, fullPage: true });

await admin.getByRole('button', { name: /① 구매 시작/ }).click();
await user.waitForSelector('text=어떤 여행을 떠나 볼까요?', { timeout: 15000 });
log('새로고침 없이 대기 → 구매 화면 자동 전환', true);

console.log('\n[C] 학생 구매');
const cards = user.locator('.product');
log('상품 카드 5개', (await cards.count()) === 5, String(await cards.count()));
log('자리표시자 소개 문구', (await cards.first().innerText()).includes('자리표시자'));
const submitBtn = user.getByRole('button', { name: /이 상품 구매하기/ });
log('선택 전 제출 버튼 비활성', await submitBtn.isDisabled());
await cards.nth(1).click();
log('선택 시 체크 아이콘/선택 표시', (await cards.nth(1).innerText()).includes('선택함'));
log('선택 상태 안내(색 외 텍스트)', (await user.locator('.selection-status').innerText()).includes('선택함'));
await user.fill('#review', '일');
log('기대평 2자 미만이면 제출 불가', await submitBtn.isDisabled());
await user.fill('#review', '일본 바다를 보고 싶어요');
log('기대평 입력 후 제출 버튼 활성', await submitBtn.isEnabled());
await noHScroll(user, '구매 화면 360px');
await user.screenshot({ path: `${SHOT}/04-purchase-student-360.png`, fullPage: true });

// 학생은 하나만 — 다른 카드를 누르면 선택이 바뀐다
await cards.nth(3).click();
log('학생은 1개만 선택(선택 교체)', (await user.locator('.product.is-selected').count()) === 1);
await cards.nth(1).click();

await submitBtn.click();
await user.waitForSelector('text=이대로 구매할까요?');
const modalText = await user.locator('.modal').innerText();
log('확인창에 모둠·국가 표시', /2모둠 · 일본/.test(modalText), modalText.slice(0, 80));
await user.screenshot({ path: `${SHOT}/05-confirm-360.png` });
await user.getByRole('button', { name: '구매 확정' }).click();
await user.waitForSelector('text=BOARDING PASS');
log('구매 완료 → 탑승권 화면', true);
await noHScroll(user, '탑승권 360px');
await user.screenshot({ path: `${SHOT}/06-ticket-360.png`, fullPage: true });

await user.reload();
await user.waitForSelector('text=BOARDING PASS');
log('새로고침 후에도 구매 완료 상태 유지', true);

console.log('\n[D] 재구매 차단 / 학부모 흐름');
await user.getByRole('button', { name: /체험 기록 지우고/ }).click();
await user.waitForSelector('text=어서 오세요!');
await user.getByRole('button', { name: /학생으로 입장/ }).click();
await user.fill('#student-no', '1');
await user.fill('#student-name', '체험1');
await user.getByRole('button', { name: '입장하기' }).click();
await user.waitForSelector('.notice-error');
log('구매한 학생 재입장 차단', (await user.locator('.notice-error').innerText()).includes('이미 구매를 마쳤어요'));

await user.getByRole('button', { name: '뒤로' }).click();
await user.getByRole('button', { name: /학부모로 입장/ }).click();
log('학부모 안내(여행권 2장)', (await user.locator('.notice-info').first().innerText()).includes('여행권 2장이 제공됩니다'));
await user.fill('#parent-code', 'wrong');
await user.getByRole('button', { name: '입장하기' }).click();
await user.waitForSelector('.notice-error');
log('잘못된 학부모 코드 차단', (await user.locator('.notice-error').innerText()).includes('참여 코드가 달라요'));
await user.fill('#parent-code', ' travel ');
await user.getByRole('button', { name: '입장하기' }).click();
await user.waitForSelector('text=학부모 고객님, 어서 오세요!');
log('학부모 입장(공백/소문자 허용)', true);

const status = user.locator('.selection-status');
log('선택 전 안내 문구', (await status.innerText()).includes('여행 상품 2개를 골라주세요'));
await user.locator('.product').nth(0).click();
log('1개 선택 안내 문구', (await status.innerText()).includes('2개 중 1개 선택 · 상품 1개를 더 골라주세요'));
await user.fill('#review', '두 곳 모두 가 보고 싶어요');
log('1개만 선택 시 제출 버튼 비활성', await user.getByRole('button', { name: /이 상품 구매하기/ }).isDisabled());
await user.locator('.product').nth(2).click();
log('2개 선택 완료 문구', (await status.innerText()).includes('2개 중 2개 선택 완료'));
await user.locator('.product').nth(4).click();
log('3번째 선택 차단 + 안내', (await user.locator('.notice-error').innerText()).includes('여행권은 2장이에요'));
log('선택은 2개로 유지', (await user.locator('.product.is-selected').count()) === 2);
await noHScroll(user, '학부모 구매 화면 360px');
await user.screenshot({ path: `${SHOT}/07-purchase-parent-360.png`, fullPage: true });

await user.getByRole('button', { name: /이 상품 구매하기/ }).click();
await user.waitForSelector('text=이대로 구매할까요?');
const pModal = await user.locator('.modal').innerText();
log('확인창에 학부모의 두 상품 모두 표시', /1모둠 · 덴마크/.test(pModal) && /3모둠 · 필리핀/.test(pModal));
await user.getByRole('button', { name: '구매 확정' }).click();
await user.waitForSelector('text=BOARDING PASS');
log('학부모 구매 완료', (await user.locator('.ticket').innerText()).includes('여행권'));

console.log('\n[E] 관리자 실시간 현황');
await admin.waitForFunction(
  () => document.body.innerText.includes('총 참여자') && /2\s*명/.test(document.body.innerText),
  null,
  { timeout: 15000 },
);
const stats = await admin.locator('.stat-grid').first().innerText();
log('참여 학생 1/18 반영', /1\s*\/ 18명/.test(stats), stats.replace(/\n/g, ' | ').slice(0, 200));
log('발행 여행권 3장 (학생1 + 학부모1×2)', /발행된 전체 여행권\s*3/.test(stats.replace(/\n/g, ' ')), stats.replace(/\n/g, ' '));
log('관리자 막대그래프 표시', (await admin.locator('.admin-bar-row').count()) === 5);
await noHScroll(admin, '관리자 1440px');
await admin.screenshot({ path: `${SHOT}/08-admin-live-1440.png`, fullPage: true });

const userText = await user.locator('body').innerText();
log('참여자 화면에 중간 판매량/순위 노출 없음', !/판매된 여행권 \d+장|1위|순위/.test(userText), userText.slice(0, 120));

console.log('\n[F] 마감 / 공개 범위');
await admin.getByRole('button', { name: /② 구매 끝/ }).click();
await user.waitForSelector('text=구매가 마감되었습니다', { timeout: 15000 });
log('마감 후 참여자 화면 전환', true);

// 동점 상황 리허설 데이터 주입 (경계 동점)
await admin.getByRole('button', { name: '경계 동점(TOP 2)' }).click();
await admin.waitForFunction(() => document.body.innerText.includes('공동 2위'), null, { timeout: 15000 });
log('경계 동점 데이터 반영(공동 2위 표시)', true);
log('0장 상품에 "확인 필요" 표시', (await admin.locator('.badge-warn').count()) >= 0);

await admin.getByRole('button', { name: /TOP 2 공개/ }).click();
await admin.waitForSelector('.preview-frame');
const previewText = await admin.locator('.preview-frame').innerText();
log('미리보기: 동점으로 3개 공개', (await admin.locator('.preview-frame .rank-card').count()) === 3, String(await admin.locator('.preview-frame .rank-card').count()));
const warnTexts = await admin.locator('.notice-warn').allInnerTexts();
log('동점 추가 공개 안내', warnTexts.some((t) => t.includes('동점 때문에')), JSON.stringify(warnTexts));
log('미리보기에 SOLD OUT 도장', previewText.includes('SOLD OUT'));
await admin.screenshot({ path: `${SHOT}/09-admin-preview-1440.png`, fullPage: true });

await admin.getByRole('button', { name: '이 범위로 결과 공개' }).click();
await admin.waitForSelector('.modal');
const revealModal = await admin.locator('.modal').innerText();
log('공개 확인창: 범위/모둠/숨김/동점/기대평 안내', /TOP 2 공개/.test(revealModal) && /숨겨질 상품/.test(revealModal) && /동점으로 추가 공개/.test(revealModal) && /공개될 기대평/.test(revealModal));
await admin.screenshot({ path: `${SHOT}/10-admin-reveal-confirm-1440.png` });
await admin.getByRole('button', { name: '공개하기' }).click();

await user.waitForSelector('text=오늘 가장 사랑받은 여행 상품', { timeout: 15000 });
log('참여자 화면 자동으로 결과 화면 전환', true);
const resultText = await user.locator('body').innerText();
log('결과: 판매된 여행권 수 표기', /판매된 여행권 \d+장/.test(resultText));
log('결과: 매출액 표현 없음', !/매출/.test(resultText));
log('결과: 부정적 표현 없음', !/실패|꼴찌|매진 실패/.test(resultText));
log('결과: 마무리 문구', resultText.includes('모든 모둠이 지형과 기후를 담은 멋진 여행 상품을 완성했습니다!'));
log('결과: 공개 카드 3개(동점 포함)', (await user.locator('.rank-card').count()) === 3, String(await user.locator('.rank-card').count()));
await noHScroll(user, '결과 화면 360px');
await user.screenshot({ path: `${SHOT}/11-results-360.png`, fullPage: true });

// 미리보기 = 실제 공개 화면 비교
const normalize = (t) => t.replace(/\s+/g, ' ').trim();
const adminPreviewNow = normalize(await admin.locator('.preview-frame .rank-list').innerText());
const userResultNow = normalize(await user.locator('.rank-list').innerText());
log('관리자 미리보기와 실제 공개 화면 일치', adminPreviewNow === userResultNow, `\n  preview: ${adminPreviewNow}\n  actual : ${userResultNow}`);

console.log('\n[G] 공개 범위 확대 / 전체 공개');
await admin.getByRole('button', { name: /전체 순위 공개/ }).click();
await admin.waitForSelector('.preview-frame');
// 2초 주기 폴링이 교사의 선택을 되돌리지 않아야 한다
await admin.waitForTimeout(5000);
log('폴링 후에도 교사가 고른 공개 범위 유지', (await admin.locator('.scope-option.is-active').innerText()).includes('전체 순위 공개'), await admin.locator('.scope-option.is-active').innerText());
await admin.getByRole('button', { name: '공개 범위 바꾸기' }).click();
await admin.waitForSelector('.modal');
await admin.getByRole('button', { name: '공개하기' }).click();
await user.waitForFunction(() => document.querySelectorAll('.rank-card').length === 5, null, { timeout: 15000 });
log('전체 공개 시 5개 모두 표시', true);
await user.screenshot({ path: `${SHOT}/12-results-all-360.png`, fullPage: true });

console.log('\n[H] 화면 크기별 확인');
for (const [w, h, name] of [[360, 800, '360x800'], [390, 844, '390x844'], [430, 932, '430x932'], [1440, 900, '1440x900'], [1920, 1080, '1920x1080']]) {
  await user.setViewportSize({ width: w, height: h });
  await user.waitForTimeout(250);
  await noHScroll(user, `결과 화면 ${name}`);
  await user.screenshot({ path: `${SHOT}/13-results-${name}.png`, fullPage: true });
}
for (const [w, h, name] of [[360, 800, '360x800'], [1920, 1080, '1920x1080']]) {
  await admin.setViewportSize({ width: w, height: h });
  await admin.waitForTimeout(250);
  await noHScroll(admin, `관리자 ${name}`);
  await admin.screenshot({ path: `${SHOT}/14-admin-${name}.png`, fullPage: true });
}

console.log('\n[I] 접근성 / 모바일 입력');
await user.setViewportSize({ width: 360, height: 800 });
// demo 체험 기록을 지우고 첫 화면으로 되돌린다
await user.evaluate(() => localStorage.clear());
await user.goto(`${BASE}/?demo=1`);
await user.waitForSelector('text=어서 오세요!');
const tapSizes = await user.$$eval('.btn', (els) => els.map((e) => e.getBoundingClientRect().height));
log('모든 버튼 높이 44px 이상', tapSizes.every((h) => h >= 43.5), JSON.stringify(tapSizes));
await user.getByRole('button', { name: /학생으로 입장/ }).click();
const fontSizes = await user.$$eval('input', (els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
log('입력창 글자 16px 이상(iOS 자동 확대 방지)', fontSizes.every((f) => f >= 16), JSON.stringify(fontSizes));
await user.keyboard.press('Tab');
const focused = await user.evaluate(() => document.activeElement?.tagName);
log('키보드 탐색 가능', Boolean(focused));

// 모션 감소 설정
const rmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
watch(rm, 'reduced-motion');
await rm.goto(`${BASE}/?demo=1`);
await rm.waitForSelector('text=어서 오세요!');
log('prefers-reduced-motion 환경에서도 정상 렌더링', await rm.locator('.card').first().isVisible());
await rmCtx.close();

// iPhone 에뮬레이션 (Safari 유사 환경)
const iCtx = await browser.newContext({ ...devices['iPhone 12'] });
const ip = await iCtx.newPage();
watch(ip, 'iphone');
await ip.goto(`${BASE}/?demo=1`);
await ip.waitForSelector('text=어서 오세요!');
await noHScroll(ip, 'iPhone 12 에뮬레이션');
await ip.screenshot({ path: `${SHOT}/15-iphone12.png`, fullPage: true });
await iCtx.close();

console.log('\n[J] 콘솔 오류');
log('브라우저 콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join('\n'));

await browser.close();
console.log(`\n===== 브라우저 검증 결과: ${pass} 통과 / ${fail} 실패 =====`);
process.exit(fail > 0 ? 1 : 0);
