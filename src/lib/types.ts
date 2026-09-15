/** 수업 진행 단계 */
export type Phase = 'waiting' | 'open' | 'closed' | 'revealed';

/** 결과 공개 범위 */
export type RevealScope = 'none' | 'top1' | 'top2' | 'top3' | 'all';

/** 참여자 유형 */
export type ParticipantType = 'student' | 'parent';

/** 여행 상품(모둠) */
export interface Product {
  id: string;
  groupNo: number;
  countryName: string;
  /** ISO 3166-1 alpha-2, 국가 식별 칩에 사용 */
  countryCode: string;
  displayOrder: number;
  /** 아직 정해지지 않았다면 자리표시자 문구 */
  tagline: string | null;
  imageUrl: string | null;
  themeColor: string;
  isActive: boolean;
}

/** 공개 가능한 수업 상태 (참여자 화면에서 조회) */
export interface PublicSession {
  slug: string;
  title: string;
  subtitle: string;
  tagline: string;
  phase: Phase;
  revealScope: RevealScope;
  products: Product[];
  /** 반 전체 학생 수(진행률 표시에만 사용) */
  studentCapacity: number;
  updatedAt: string;
}

/** 상품별 집계 한 줄 (교사 전용) */
export interface ProductTally {
  productId: string;
  groupNo: number;
  countryName: string;
  countryCode: string;
  themeColor: string;
  /** 판매된 여행권 수 */
  sold: number;
  studentSold: number;
  parentSold: number;
}

/** 교사 전용 실시간 현황 */
export interface AdminTally {
  phase: Phase;
  revealScope: RevealScope;
  studentParticipants: number;
  studentCapacity: number;
  parentParticipants: number;
  totalParticipants: number;
  /** 발행된 전체 여행권 수 = 학생 수 + 학부모 수 × 2 */
  issuedTickets: number;
  studentTickets: number;
  parentTickets: number;
  products: ProductTally[];
  countedAt: string;
}

/** 순위가 매겨진 상품 한 줄 */
export interface RankedProduct extends ProductTally {
  /** 공동 순위를 반영한 경쟁식 순위 (1,1,3,...) */
  rank: number;
  /** 전체 발행 여행권 중 비율 (0~100, 소수 첫째 자리) */
  sharePercent: number;
  /** 공동 순위 여부 */
  tied: boolean;
}

/** 익명 기대평 */
export interface PublicReview {
  id: string;
  participantType: ParticipantType;
  review: string;
  /** 학생 1개 / 학부모 2개 */
  countryTags: { countryName: string; countryCode: string; groupNo: number }[];
}

/** 공개 결과 */
export interface PublicResults {
  phase: Phase;
  revealScope: RevealScope;
  /** 공개 범위 안의 상품 (순위 오름차순) */
  revealed: RankedProduct[];
  hiddenCount: number;
  totalParticipants: number;
  studentParticipants: number;
  parentParticipants: number;
  issuedTickets: number;
  reviews: PublicReview[];
  /** 집계된 여행권이 하나도 없을 때 true */
  empty: boolean;
}

/** 참여권(임시 토큰) — 브라우저에만 보관 */
export interface Pass {
  token: string;
  participantType: ParticipantType;
  /** 학생일 때만, 화면 인사말용 (서버에 저장되지 않음) */
  displayName?: string;
}

export interface SubmitResult {
  submissionId: string;
  productIds: string[];
  review: string;
  participantType: ParticipantType;
  createdAt: string;
}

/** 사용자에게 보여줄 한국어 오류 */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}
