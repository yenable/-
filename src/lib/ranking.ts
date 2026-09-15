import type {
  AdminTally,
  ProductTally,
  PublicResults,
  PublicReview,
  RankedProduct,
  RevealScope,
} from './types';

/**
 * 순위/동점/공개 범위 계산은 모두 이 파일의 함수만 사용한다.
 * (교사 현황 · 공개 미리보기 · 실제 공개 결과가 언제나 같은 값을 쓰도록)
 */

/** 공개 범위 → 포함할 최대 순위. 'all'은 제한 없음(null), 'none'은 0 */
export function scopeRankLimit(scope: RevealScope): number | null {
  switch (scope) {
    case 'top1':
      return 1;
    case 'top2':
      return 2;
    case 'top3':
      return 3;
    case 'all':
      return null;
    case 'none':
    default:
      return 0;
  }
}

export const SCOPE_LABEL: Record<RevealScope, string> = {
  none: '아직 공개 안 함',
  top1: '1위만 공개',
  top2: 'TOP 2 공개',
  top3: 'TOP 3 공개',
  all: '전체 순위 공개',
};

/** 공개 범위 넓이 비교용 (좁을수록 작은 값) */
export function scopeWidth(scope: RevealScope): number {
  switch (scope) {
    case 'none':
      return 0;
    case 'top1':
      return 1;
    case 'top2':
      return 2;
    case 'top3':
      return 3;
    case 'all':
      return 99;
  }
}

export function totalSold(products: ProductTally[]): number {
  return products.reduce((sum, p) => sum + p.sold, 0);
}

/**
 * 판매량 내림차순으로 경쟁식 순위(1, 1, 3 ...)를 매긴다.
 * 판매량이 같으면 모둠 번호 오름차순으로 표시 순서만 정한다(순위는 동일).
 */
export function rankProducts(
  products: ProductTally[],
  issuedTickets: number,
): RankedProduct[] {
  const sorted = [...products].sort(
    (a, b) => b.sold - a.sold || a.groupNo - b.groupNo,
  );
  const counts = new Map<number, number>();
  for (const p of sorted) counts.set(p.sold, (counts.get(p.sold) ?? 0) + 1);

  const ranked: RankedProduct[] = [];
  sorted.forEach((p, index) => {
    const prev = ranked[index - 1];
    const rank = prev && prev.sold === p.sold ? prev.rank : index + 1;
    ranked.push({
      ...p,
      rank,
      tied: (counts.get(p.sold) ?? 1) > 1,
      sharePercent:
        issuedTickets > 0
          ? Math.round((p.sold / issuedTickets) * 1000) / 10
          : 0,
    });
  });
  return ranked;
}

export interface RevealPlan {
  scope: RevealScope;
  /** 실제로 공개될 상품 (순위 오름차순) */
  revealed: RankedProduct[];
  /** 공개되지 않는 상품 수 */
  hiddenCount: number;
  /** 공개 범위 기준 개수(예: TOP 2 → 2). 'all'이면 전체 상품 수 */
  requestedCount: number;
  /** 동점 때문에 기준 개수보다 더 공개되는 상품 수 */
  extraByTie: number;
  /** 모든 상품이 0장이라 공개할 결과가 없는 경우 */
  empty: boolean;
}

/**
 * 공개 범위를 "상품 개수"가 아니라 "순위"로 계산한다.
 *  - 공동 1위가 둘이면 top1에서도 둘 다 공개
 *  - 1위 뒤 공동 2위가 둘이면 top2에서 세 상품 공개
 *  - 판매량 0인 상품은 '전체 순위 공개'에서만 포함한다
 */
export function planReveal(
  ranked: RankedProduct[],
  scope: RevealScope,
): RevealPlan {
  const sold = totalSold(ranked);
  const empty = sold === 0;
  const limit = scopeRankLimit(scope);

  let revealed: RankedProduct[];
  if (scope === 'all') {
    revealed = empty ? [] : [...ranked];
  } else if (limit === null || limit === 0) {
    revealed = [];
  } else {
    revealed = ranked.filter((p) => p.rank <= limit && p.sold > 0);
  }

  const requestedCount =
    scope === 'all' ? ranked.length : Math.min(limit ?? 0, ranked.length);

  return {
    scope,
    revealed,
    hiddenCount: ranked.length - revealed.length,
    requestedCount,
    extraByTie: Math.max(0, revealed.length - requestedCount),
    empty,
  };
}

export interface RawReview {
  id: string;
  participantType: 'student' | 'parent';
  review: string;
  productIds: string[];
  createdAt: string;
}

/**
 * 기대평 공개 규칙
 *  - 학생: 선택한 상품 1개가 공개 범위 안일 때만 공개 (국가 태그 1개)
 *  - 학부모: 선택한 2개가 "모두" 공개 범위 안일 때만 공개 (국가 태그 2개, 한 번만)
 *  - 하나라도 숨겨졌으면 기대평 전체를 숨겨 숨은 상품의 득표가 드러나지 않게 한다
 */
export function visibleReviews(
  reviews: RawReview[],
  revealedProducts: RankedProduct[],
): PublicReview[] {
  const byId = new Map(revealedProducts.map((p) => [p.productId, p]));
  const out: PublicReview[] = [];
  for (const r of reviews) {
    const ids = [...new Set(r.productIds)];
    if (ids.length === 0) continue;
    if (!ids.every((id) => byId.has(id))) continue;
    out.push({
      id: r.id,
      participantType: r.participantType,
      review: r.review,
      countryTags: ids
        .map((id) => byId.get(id)!)
        .sort((a, b) => a.groupNo - b.groupNo)
        .map((p) => ({
          countryName: p.countryName,
          countryCode: p.countryCode,
          groupNo: p.groupNo,
        })),
    });
  }
  return out;
}

/** 교사 현황 + 기대평 원본 → 참여자에게 보여줄 공개 결과 */
export function buildPublicResults(
  tally: AdminTally,
  reviews: RawReview[],
  scope: RevealScope,
  phase: AdminTally['phase'] = 'revealed',
): PublicResults {
  const ranked = rankProducts(tally.products, tally.issuedTickets);
  const plan = planReveal(ranked, scope);
  return {
    phase,
    revealScope: scope,
    revealed: plan.revealed,
    hiddenCount: plan.hiddenCount,
    totalParticipants: tally.totalParticipants,
    studentParticipants: tally.studentParticipants,
    parentParticipants: tally.parentParticipants,
    issuedTickets: tally.issuedTickets,
    reviews: visibleReviews(reviews, plan.revealed),
    empty: plan.empty,
  };
}

/** 1, 2, 3 → "1위" */
export function rankLabel(rank: number): string {
  return `${rank}위`;
}
