import { describe, expect, it } from 'vitest';
import {
  buildPublicResults,
  planReveal,
  rankProducts,
  scopeRankLimit,
  scopeWidth,
  totalSold,
  visibleReviews,
  type RawReview,
} from '../lib/ranking';
import type { AdminTally, ProductTally } from '../lib/types';

const COUNTRIES = ['덴마크', '일본', '필리핀', '캐나다', '사우디아라비아'];

function tallies(sold: number[]): ProductTally[] {
  return sold.map((n, i) => ({
    productId: `p${i + 1}`,
    groupNo: i + 1,
    countryName: COUNTRIES[i],
    countryCode: ['DK', 'JP', 'PH', 'CA', 'SA'][i],
    themeColor: '#000',
    sold: n,
    studentSold: n,
    parentSold: 0,
  }));
}

describe('순위 계산', () => {
  it('판매량 내림차순으로 경쟁식 순위를 매긴다', () => {
    const ranked = rankProducts(tallies([3, 9, 1, 5, 0]), 18);
    expect(ranked.map((r) => r.groupNo)).toEqual([2, 4, 1, 3, 5]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('동점이면 같은 순위를 주고 다음 순위를 건너뛴다 (1,1,3)', () => {
    const ranked = rankProducts(tallies([6, 6, 3, 2, 1]), 18);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 4, 5]);
    expect(ranked[0].tied).toBe(true);
    expect(ranked[2].tied).toBe(false);
  });

  it('비율은 참여자 수가 아니라 발행 여행권 수를 기준으로 한다', () => {
    // 학생 18 + 학부모 7×2 = 32장
    const ranked = rankProducts(tallies([8, 8, 6, 6, 4]), 32);
    expect(ranked[0].sharePercent).toBe(25);
    expect(ranked[4].sharePercent).toBe(12.5);
    expect(totalSold(ranked)).toBe(32);
  });

  it('발행 여행권이 0장이면 비율은 0으로 처리한다', () => {
    expect(rankProducts(tallies([0, 0, 0, 0, 0]), 0)[0].sharePercent).toBe(0);
  });
});

describe('공개 범위', () => {
  it('scopeRankLimit / scopeWidth', () => {
    expect(scopeRankLimit('top1')).toBe(1);
    expect(scopeRankLimit('top3')).toBe(3);
    expect(scopeRankLimit('all')).toBeNull();
    expect(scopeRankLimit('none')).toBe(0);
    expect(scopeWidth('top2')).toBeLessThan(scopeWidth('all'));
  });

  it('1위만 공개 — 1개만 공개되고 나머지는 숨긴다', () => {
    const ranked = rankProducts(tallies([3, 9, 1, 5, 0]), 18);
    const plan = planReveal(ranked, 'top1');
    expect(plan.revealed.map((r) => r.groupNo)).toEqual([2]);
    expect(plan.hiddenCount).toBe(4);
    expect(plan.extraByTie).toBe(0);
  });

  it('공동 1위가 둘이면 1위만 공개에서도 둘 다 공개한다', () => {
    const ranked = rankProducts(tallies([6, 6, 3, 2, 1]), 18);
    const plan = planReveal(ranked, 'top1');
    expect(plan.revealed).toHaveLength(2);
    expect(plan.revealed.every((r) => r.rank === 1)).toBe(true);
    expect(plan.extraByTie).toBe(1);
    expect(plan.hiddenCount).toBe(3);
  });

  it('경계 순위 동점 — 1위 뒤 공동 2위가 둘이면 TOP 2에서 3개 공개', () => {
    const ranked = rankProducts(tallies([8, 5, 5, 3, 1]), 22);
    const plan = planReveal(ranked, 'top2');
    expect(plan.revealed.map((r) => r.groupNo)).toEqual([1, 2, 3]);
    expect(plan.revealed.map((r) => r.rank)).toEqual([1, 2, 2]);
    expect(plan.extraByTie).toBe(1);
    expect(plan.hiddenCount).toBe(2);
  });

  it('TOP 3 경계 동점이면 네 상품까지 공개된다', () => {
    const ranked = rankProducts(tallies([8, 5, 3, 3, 1]), 20);
    const plan = planReveal(ranked, 'top3');
    expect(plan.revealed.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
    expect(plan.extraByTie).toBe(1);
  });

  it('전체 공개는 0장 상품까지 모두 보여준다', () => {
    const ranked = rankProducts(tallies([8, 5, 3, 0, 0]), 16);
    const plan = planReveal(ranked, 'all');
    expect(plan.revealed).toHaveLength(5);
    expect(plan.hiddenCount).toBe(0);
  });

  it('부분 공개에서는 0장 상품이 순위 안에 들어와도 공개하지 않는다', () => {
    const ranked = rankProducts(tallies([5, 2, 0, 0, 0]), 7);
    const plan = planReveal(ranked, 'top3');
    expect(plan.revealed.map((r) => r.groupNo)).toEqual([1, 2]);
    expect(plan.hiddenCount).toBe(3);
  });

  it('모든 상품이 0장이면 억지로 1위를 만들지 않는다', () => {
    const ranked = rankProducts(tallies([0, 0, 0, 0, 0]), 0);
    for (const scope of ['top1', 'top2', 'top3', 'all'] as const) {
      const plan = planReveal(ranked, scope);
      expect(plan.empty).toBe(true);
      expect(plan.revealed).toHaveLength(0);
    }
  });

  it('공개 전(none)에는 아무것도 공개하지 않는다', () => {
    const plan = planReveal(rankProducts(tallies([5, 4, 3, 2, 1]), 15), 'none');
    expect(plan.revealed).toHaveLength(0);
    expect(plan.hiddenCount).toBe(5);
  });
});

describe('기대평 공개 규칙', () => {
  const ranked = rankProducts(tallies([8, 5, 3, 1, 0]), 17);
  const reviews: RawReview[] = [
    {
      id: 'r1',
      participantType: 'student',
      review: '덴마크 가고 싶어요',
      productIds: ['p1'],
      createdAt: '',
    },
    {
      id: 'r2',
      participantType: 'student',
      review: '캐나다 궁금해요',
      productIds: ['p4'],
      createdAt: '',
    },
    {
      id: 'r3',
      participantType: 'parent',
      review: '두 곳 모두 좋아요',
      productIds: ['p1', 'p2'],
      createdAt: '',
    },
    {
      id: 'r4',
      participantType: 'parent',
      review: '하나는 숨은 상품',
      productIds: ['p1', 'p4'],
      createdAt: '',
    },
  ];

  it('공개 범위 안의 학생 기대평만 국가 태그 1개와 함께 보인다', () => {
    const visible = visibleReviews(reviews, planReveal(ranked, 'top2').revealed);
    const ids = visible.map((v) => v.id);
    expect(ids).toContain('r1');
    expect(ids).not.toContain('r2');
    expect(visible.find((v) => v.id === 'r1')!.countryTags).toHaveLength(1);
  });

  it('학부모 기대평은 두 상품이 모두 공개될 때만, 태그 2개와 함께 한 번만 나온다', () => {
    const visible = visibleReviews(reviews, planReveal(ranked, 'top2').revealed);
    const parent = visible.filter((v) => v.participantType === 'parent');
    expect(parent).toHaveLength(1);
    expect(parent[0].id).toBe('r3');
    expect(parent[0].countryTags.map((t) => t.countryName)).toEqual([
      '덴마크',
      '일본',
    ]);
  });

  it('학부모가 고른 상품 중 하나라도 숨겨져 있으면 기대평을 숨긴다', () => {
    const visible = visibleReviews(reviews, planReveal(ranked, 'top1').revealed);
    expect(visible.map((v) => v.id)).toEqual(['r1']);
  });

  it('공개 범위를 넓히면 숨어 있던 학부모 기대평이 공개된다', () => {
    const visible = visibleReviews(reviews, planReveal(ranked, 'all').revealed);
    expect(visible.map((v) => v.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('공개 결과 조립', () => {
  const tally: AdminTally = {
    phase: 'revealed',
    revealScope: 'top1',
    studentParticipants: 18,
    studentCapacity: 18,
    parentParticipants: 7,
    totalParticipants: 25,
    issuedTickets: 32,
    studentTickets: 18,
    parentTickets: 14,
    products: tallies([10, 9, 6, 5, 2]),
    countedAt: '',
  };

  it('발행 여행권 수는 학생 수 + 학부모 수 × 2 이다', () => {
    expect(tally.issuedTickets).toBe(18 + 7 * 2);
    expect(totalSold(tally.products)).toBe(32);
  });

  it('공개 결과는 공개 범위와 기대평 규칙을 함께 적용한다', () => {
    const res = buildPublicResults(tally, [], 'top2');
    expect(res.revealed.map((r) => r.groupNo)).toEqual([1, 2]);
    expect(res.hiddenCount).toBe(3);
    expect(res.totalParticipants).toBe(25);
    expect(res.issuedTickets).toBe(32);
    expect(res.revealed[0].sharePercent).toBeCloseTo(31.3, 1);
  });
});
