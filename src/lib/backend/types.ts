import type { RawReview } from '../ranking';
import type {
  AdminTally,
  Pass,
  ParticipantType,
  Phase,
  PublicResults,
  PublicSession,
  RevealScope,
  SubmitResult,
} from '../types';

export interface AdminIdentity {
  id: string;
  email: string;
  demo?: boolean;
}

/** demo backend와 supabase backend가 공통으로 구현하는 인터페이스 */
export interface Backend {
  kind: 'demo' | 'supabase';

  /* ---- 참여자 ---- */
  getPublicSession(): Promise<PublicSession>;
  /** 상태 변경을 구독한다. 정리 함수를 돌려준다. */
  subscribeSession(onChange: () => void): () => void;
  issueStudentPass(studentNo: number, studentName: string): Promise<Pass>;
  issueParentPass(code: string, browserKey: string): Promise<Pass>;
  submitPurchase(
    token: string,
    productIds: string[],
    review: string,
  ): Promise<SubmitResult>;
  /** phase !== 'revealed' 이면 서버에서 거부된다 */
  getPublicResults(): Promise<PublicResults>;

  /* ---- 교사(관리자) ---- */
  getAdminIdentity(): Promise<AdminIdentity | null>;
  adminSignIn(email: string, password: string): Promise<AdminIdentity>;
  adminSignOut(): Promise<void>;
  adminGetTally(): Promise<AdminTally>;
  adminGetReviews(): Promise<RawReview[]>;
  /** 실제 공개와 동일한 규칙으로 계산된 미리보기 */
  adminPreviewResults(scope: RevealScope): Promise<PublicResults>;
  adminSetPhase(phase: Phase): Promise<void>;
  adminSetRevealScope(scope: RevealScope): Promise<void>;
  adminReset(keepRoster: boolean): Promise<void>;

  /* ---- demo 전용 ---- */
  demoSeed?(kind: DemoSeedKind): Promise<void>;
  demoParentCodeHint?(): string;
  demoRosterHint?(): string;
}

export type DemoSeedKind =
  | 'clear'
  | 'normal'
  | 'tie-first'
  | 'tie-boundary'
  | 'with-zero';

export type { ParticipantType };
