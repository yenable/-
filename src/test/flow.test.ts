import { beforeEach, describe, expect, it } from 'vitest';
import { createTestBackend } from '../lib/backend/demo';
import type { Backend } from '../lib/backend/types';
import { AppError } from '../lib/types';

async function expectError(fn: () => Promise<unknown>, code?: string) {
  let caught: unknown = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, '오류가 발생해야 한다').toBeInstanceOf(AppError);
  if (code) expect((caught as AppError).code).toBe(code);
  return caught as AppError;
}

let api: Backend;

async function asAdmin() {
  await api.adminSignIn('teacher@example.com', 'demo');
}

async function open() {
  await asAdmin();
  await api.adminSetPhase('open');
}

async function studentBuys(no: number, productId: string, review = '기대돼요') {
  const pass = await api.issueStudentPass(no, `체험${no}`);
  return api.submitPurchase(pass.token, [productId], review);
}

async function parentBuys(key: string, a: string, b: string, review = '두 곳 기대돼요') {
  const pass = await api.issueParentPass('TRAVEL', key);
  return api.submitPurchase(pass.token, [a, b], review);
}

beforeEach(() => {
  api = createTestBackend();
});

describe('입장', () => {
  it('명단에 있는 번호+이름이면 참여권을 받는다', async () => {
    const pass = await api.issueStudentPass(3, '체험3');
    expect(pass.participantType).toBe('student');
    expect(pass.token).toBeTruthy();
  });

  it('이름 공백이 달라도 같은 이름으로 인정한다', async () => {
    await expect(api.issueStudentPass(3, ' 체험3 ')).resolves.toBeTruthy();
  });

  it('번호나 이름이 다르면 입장할 수 없다', async () => {
    await expectError(() => api.issueStudentPass(3, '체험4'), 'roster_mismatch');
    await expectError(() => api.issueStudentPass(99, '체험99'), 'roster_mismatch');
  });

  it('구매 시작 전에도 미리 입장할 수 있다 (대기 화면)', async () => {
    const session = await api.getPublicSession();
    expect(session.phase).toBe('waiting');
    await expect(api.issueStudentPass(1, '체험1')).resolves.toBeTruthy();
  });

  it('학부모는 공통 코드가 맞아야 입장한다', async () => {
    await expectError(() => api.issueParentPass('WRONG', 'b1'), 'bad_parent_code');
    await expect(api.issueParentPass('travel', 'b1')).resolves.toBeTruthy();
  });

  it('같은 브라우저에서 이미 구매했으면 다시 입장할 수 없다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    await parentBuys('browser-A', products[0].id, products[1].id);
    await expectError(
      () => api.issueParentPass('TRAVEL', 'browser-A'),
      'already_purchased',
    );
  });
});

describe('구매(투표) 제출', () => {
  it('waiting 상태에서는 제출할 수 없다', async () => {
    const pass = await api.issueStudentPass(1, '체험1');
    const products = (await api.getPublicSession()).products;
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id], '기대돼요'),
      'not_open',
    );
  });

  it('학생은 상품 1개와 기대평을 제출하면 여행권 1장이 집계된다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const res = await studentBuys(1, products[0].id);
    expect(res.participantType).toBe('student');

    const tally = await api.adminGetTally();
    expect(tally.studentParticipants).toBe(1);
    expect(tally.issuedTickets).toBe(1);
    expect(tally.products[0].sold).toBe(1);
    expect(tally.products[0].studentSold).toBe(1);
  });

  it('같은 학생은 다시 구매할 수 없다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    await studentBuys(1, products[0].id);
    await expectError(() => api.issueStudentPass(1, '체험1'), 'already_purchased');
  });

  it('학생이 2개를 고르면 거부한다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueStudentPass(2, '체험2');
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id, products[1].id], '둘 다요'),
      'invalid_choices',
    );
  });

  it('학부모는 서로 다른 2개를 골라야 하고 각각 1장씩 집계된다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    await parentBuys('browser-B', products[0].id, products[2].id);

    const tally = await api.adminGetTally();
    expect(tally.parentParticipants).toBe(1);
    expect(tally.parentTickets).toBe(2);
    expect(tally.issuedTickets).toBe(2);
    expect(tally.products[0].parentSold).toBe(1);
    expect(tally.products[2].parentSold).toBe(1);
  });

  it('학부모가 같은 상품을 2번 고르거나 1개만 고르면 거부한다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueParentPass('TRAVEL', 'browser-C');
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id, products[0].id], '같은 상품'),
      'invalid_choices',
    );
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id], '하나만'),
      'invalid_choices',
    );
    // 실패했으므로 참여권은 아직 살아 있다
    await expect(
      api.submitPurchase(pass.token, [products[0].id, products[1].id], '이제 두 개'),
    ).resolves.toBeTruthy();
  });

  it('기대평이 없거나 너무 길면 거부한다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueStudentPass(4, '체험4');
    await expectError(() => api.submitPurchase(pass.token, [products[0].id], '  '), 'invalid_review');
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id], '가'.repeat(81)),
      'invalid_review',
    );
  });

  it('학부모 선택 2개와 기대평은 한 번에 저장된다(부분 저장 없음)', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueParentPass('TRAVEL', 'browser-D');
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id, products[1].id], ''),
      'invalid_review',
    );
    const tally = await api.adminGetTally();
    expect(tally.parentParticipants).toBe(0);
    expect(tally.issuedTickets).toBe(0);
  });

  it('제출 버튼 연타/동시 요청에도 한 번만 집계된다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueStudentPass(5, '체험5');
    const results = await Promise.allSettled([
      api.submitPurchase(pass.token, [products[0].id], '연타1'),
      api.submitPurchase(pass.token, [products[0].id], '연타2'),
      api.submitPurchase(pass.token, [products[0].id], '연타3'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const tally = await api.adminGetTally();
    expect(tally.studentParticipants).toBe(1);
  });

  it('구매 종료 후에는 제출할 수 없다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    const pass = await api.issueStudentPass(6, '체험6');
    await api.adminSetPhase('closed');
    await expectError(
      () => api.submitPurchase(pass.token, [products[0].id], '늦었어요'),
      'not_open',
    );
  });

  it('없는 참여권으로는 제출할 수 없다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    await expectError(
      () => api.submitPurchase('가짜토큰', [products[0].id], '기대돼요'),
      'invalid_pass',
    );
  });
});

describe('집계 기준', () => {
  it('학생 18명 + 학부모 7명 → 참여자 25명 / 발행 여행권 32장', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    for (let i = 1; i <= 18; i += 1) {
      await studentBuys(i, products[i % products.length].id);
    }
    for (let i = 0; i < 7; i += 1) {
      await parentBuys(`p-browser-${i}`, products[0].id, products[1].id);
    }
    const tally = await api.adminGetTally();
    expect(tally.studentParticipants).toBe(18);
    expect(tally.parentParticipants).toBe(7);
    expect(tally.totalParticipants).toBe(25);
    expect(tally.studentTickets).toBe(18);
    expect(tally.parentTickets).toBe(14);
    expect(tally.issuedTickets).toBe(32);
    const sold = tally.products.reduce((s, p) => s + p.sold, 0);
    expect(sold).toBe(32);
  });
});

describe('결과 공개', () => {
  async function seedCounts() {
    await open();
    const products = (await api.getPublicSession()).products;
    // 1모둠 3표, 2모둠 3표(공동 1위), 3모둠 2표, 4모둠 1표, 5모둠 0표
    await studentBuys(1, products[0].id);
    await studentBuys(2, products[0].id);
    await studentBuys(3, products[0].id);
    await studentBuys(4, products[1].id);
    await studentBuys(5, products[1].id);
    await studentBuys(6, products[1].id);
    await studentBuys(7, products[2].id);
    await studentBuys(8, products[2].id);
    await studentBuys(9, products[3].id);
    return products;
  }

  it('revealed 이전에는 공개 결과 API가 막힌다', async () => {
    await seedCounts();
    await expectError(() => api.getPublicResults(), 'not_revealed');
    await api.adminSetPhase('closed');
    await expectError(() => api.getPublicResults(), 'not_revealed');
  });

  it('공동 1위는 1위만 공개에서도 둘 다 나온다', async () => {
    await seedCounts();
    await api.adminSetPhase('closed');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('top1');
    const res = await api.getPublicResults();
    expect(res.revealed).toHaveLength(2);
    expect(res.revealed.every((r) => r.rank === 1)).toBe(true);
    expect(res.hiddenCount).toBe(3);
  });

  it('공개 범위를 넓히면 더 많은 상품이 공개된다', async () => {
    await seedCounts();
    await api.adminSetPhase('closed');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('top3');
    const res = await api.getPublicResults();
    // 공동 1위 2개 + 3위 1개까지만 (4위는 TOP 3 공개 범위 밖)
    expect(res.revealed.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(res.hiddenCount).toBe(2);
  });

  it('전체 공개는 0장 상품까지 보여준다', async () => {
    await seedCounts();
    await api.adminSetPhase('closed');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('all');
    const res = await api.getPublicResults();
    expect(res.revealed).toHaveLength(5);
    expect(res.revealed[4].sold).toBe(0);
    expect(res.hiddenCount).toBe(0);
  });

  it('관리자 미리보기와 실제 공개 결과가 같다', async () => {
    await seedCounts();
    await api.adminSetPhase('closed');
    const preview = await api.adminPreviewResults('top2');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('top2');
    const actual = await api.getPublicResults();
    expect(actual.revealed.map((r) => [r.groupNo, r.rank, r.sold])).toEqual(
      preview.revealed.map((r) => [r.groupNo, r.rank, r.sold]),
    );
    expect(actual.reviews.map((r) => r.review)).toEqual(
      preview.reviews.map((r) => r.review),
    );
  });

  it('학부모 기대평은 두 상품이 모두 공개될 때 한 번만 나온다', async () => {
    const products = await seedCounts();
    await parentBuys('pb-1', products[0].id, products[1].id, '두 곳 모두 좋아요');
    await parentBuys('pb-2', products[0].id, products[4].id, '5모둠도 궁금해요');
    await api.adminSetPhase('closed');
    await api.adminSetPhase('revealed');
    // 학부모 구매까지 반영된 순위: 1모둠 5장 > 2모둠 4장 > 3모둠 2장 ...
    await api.adminSetRevealScope('top2');

    const res = await api.getPublicResults();
    const parentReviews = res.reviews.filter((r) => r.participantType === 'parent');
    expect(parentReviews).toHaveLength(1);
    expect(parentReviews[0].review).toBe('두 곳 모두 좋아요');
    expect(parentReviews[0].countryTags).toHaveLength(2);
    expect(res.reviews.some((r) => r.review === '5모둠도 궁금해요')).toBe(false);
  });

  it('아무도 구매하지 않으면 1위를 만들지 않는다', async () => {
    await open();
    await api.adminSetPhase('closed');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('all');
    const res = await api.getPublicResults();
    expect(res.empty).toBe(true);
    expect(res.revealed).toHaveLength(0);
  });
});

describe('관리자 권한', () => {
  it('로그인하지 않으면 집계/상태 변경이 모두 막힌다', async () => {
    await expectError(() => api.adminGetTally(), 'not_admin');
    await expectError(() => api.adminGetReviews(), 'not_admin');
    await expectError(() => api.adminPreviewResults('all'), 'not_admin');
    await expectError(() => api.adminSetPhase('open'), 'not_admin');
    await expectError(() => api.adminSetRevealScope('all'), 'not_admin');
    await expectError(() => api.adminReset(true), 'not_admin');
  });

  it('로그아웃하면 다시 막힌다', async () => {
    await asAdmin();
    await expect(api.adminGetTally()).resolves.toBeTruthy();
    await api.adminSignOut();
    await expectError(() => api.adminGetTally(), 'not_admin');
  });

  it('리허설 초기화는 명단을 남기고 구매/참여 상태만 지운다', async () => {
    await open();
    const products = (await api.getPublicSession()).products;
    await studentBuys(1, products[0].id);
    await api.adminReset(true);

    const tally = await api.adminGetTally();
    expect(tally.totalParticipants).toBe(0);
    expect(tally.issuedTickets).toBe(0);
    expect(tally.phase).toBe('waiting');
    // 같은 학생이 다시 입장할 수 있어야 한다
    await expect(api.issueStudentPass(1, '체험1')).resolves.toBeTruthy();
  });
});

describe('상태 전환', () => {
  it('교사가 상태를 바꾸면 공개 세션 정보에 즉시 반영된다', async () => {
    await asAdmin();
    expect((await api.getPublicSession()).phase).toBe('waiting');
    await api.adminSetPhase('open');
    expect((await api.getPublicSession()).phase).toBe('open');
    await api.adminSetPhase('closed');
    expect((await api.getPublicSession()).phase).toBe('closed');
    await api.adminSetPhase('revealed');
    await api.adminSetRevealScope('top2');
    const s = await api.getPublicSession();
    expect(s.phase).toBe('revealed');
    expect(s.revealScope).toBe('top2');
  });

  it('구독자는 상태 변경 알림을 받는다', async () => {
    let calls = 0;
    const stop = api.subscribeSession(() => {
      calls += 1;
    });
    await asAdmin();
    await api.adminSetPhase('open');
    stop();
    expect(calls).toBeGreaterThan(0);
  });
});
