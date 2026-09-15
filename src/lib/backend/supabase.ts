import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SESSION_SLUG,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '../config';
import type { RawReview } from '../ranking';
import {
  AppError,
  type AdminTally,
  type Pass,
  type Phase,
  type Product,
  type PublicResults,
  type PublicReview,
  type PublicSession,
  type RankedProduct,
  type RevealScope,
  type SubmitResult,
} from '../types';
import type { Backend } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

let client: SupabaseClient | null = null;
export function getClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

function toAppError(error: { message?: string; code?: string } | null): AppError {
  const msg = error?.message ?? '';
  if (!msg || /fetch|network|Failed to fetch|timeout/i.test(msg)) {
    return new AppError(
      'network',
      '인터넷 연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.',
    );
  }
  // DB 함수가 이미 초등학생이 이해할 수 있는 한국어 메시지를 던진다
  return new AppError(error?.code ?? 'rpc_error', msg);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().rpc(name, args);
  if (error) throw toAppError(error);
  return data as T;
}

function mapProduct(row: Json): Product {
  return {
    id: String(row.id),
    groupNo: Number(row.group_no),
    countryName: String(row.country_name),
    countryCode: String(row.country_code ?? ''),
    displayOrder: Number(row.display_order ?? row.group_no),
    tagline: row.tagline ?? null,
    imageUrl: row.image_url ?? null,
    themeColor: String(row.theme_color ?? '#2f6fb5'),
    isActive: row.is_active !== false,
  };
}

function mapSession(row: Json): PublicSession {
  return {
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ''),
    tagline: String(row.tagline ?? ''),
    phase: row.phase as Phase,
    revealScope: (row.reveal_scope ?? 'none') as RevealScope,
    products: (row.products ?? []).map(mapProduct),
    studentCapacity: Number(row.student_capacity ?? 0),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapRanked(row: Json): RankedProduct {
  return {
    productId: String(row.product_id),
    groupNo: Number(row.group_no),
    countryName: String(row.country_name),
    countryCode: String(row.country_code ?? ''),
    themeColor: String(row.theme_color ?? '#2f6fb5'),
    sold: Number(row.sold ?? 0),
    studentSold: Number(row.student_sold ?? 0),
    parentSold: Number(row.parent_sold ?? 0),
    rank: Number(row.rank ?? 0),
    sharePercent: Number(row.share_percent ?? 0),
    tied: Boolean(row.tied),
  };
}

function mapResults(row: Json): PublicResults {
  return {
    phase: (row.phase ?? 'revealed') as Phase,
    revealScope: (row.reveal_scope ?? 'none') as RevealScope,
    revealed: (row.revealed ?? []).map(mapRanked),
    hiddenCount: Number(row.hidden_count ?? 0),
    totalParticipants: Number(row.total_participants ?? 0),
    studentParticipants: Number(row.student_participants ?? 0),
    parentParticipants: Number(row.parent_participants ?? 0),
    issuedTickets: Number(row.issued_tickets ?? 0),
    reviews: (row.reviews ?? []).map(
      (r: Json): PublicReview => ({
        id: String(r.id),
        participantType: r.participant_type,
        review: String(r.review ?? ''),
        countryTags: (r.country_tags ?? []).map((t: Json) => ({
          countryName: String(t.country_name),
          countryCode: String(t.country_code ?? ''),
          groupNo: Number(t.group_no),
        })),
      }),
    ),
    empty: Boolean(row.empty),
  };
}

function mapTally(row: Json): AdminTally {
  return {
    phase: row.phase as Phase,
    revealScope: (row.reveal_scope ?? 'none') as RevealScope,
    studentParticipants: Number(row.student_participants ?? 0),
    studentCapacity: Number(row.student_capacity ?? 0),
    parentParticipants: Number(row.parent_participants ?? 0),
    totalParticipants: Number(row.total_participants ?? 0),
    issuedTickets: Number(row.issued_tickets ?? 0),
    studentTickets: Number(row.student_tickets ?? 0),
    parentTickets: Number(row.parent_tickets ?? 0),
    products: (row.products ?? []).map((p: Json) => ({
      productId: String(p.product_id),
      groupNo: Number(p.group_no),
      countryName: String(p.country_name),
      countryCode: String(p.country_code ?? ''),
      themeColor: String(p.theme_color ?? '#2f6fb5'),
      sold: Number(p.sold ?? 0),
      studentSold: Number(p.student_sold ?? 0),
      parentSold: Number(p.parent_sold ?? 0),
    })),
    countedAt: String(row.counted_at ?? new Date().toISOString()),
  };
}

export function createSupabaseBackend(slug = SESSION_SLUG): Backend {
  return {
    kind: 'supabase',

    async getPublicSession() {
      return mapSession(await rpc<Json>('get_public_session', { p_slug: slug }));
    },

    subscribeSession(onChange) {
      const supabase = getClient();
      const channel = supabase
        .channel(`session-${slug}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'class_sessions' },
          () => onChange(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'purchase_submissions' },
          () => onChange(),
        )
        .subscribe();

      // Realtime이 막혀 있거나 끊겨도 동작하도록 짧은 주기 폴링을 함께 사용한다
      const timer = setInterval(onChange, 4000);

      return () => {
        clearInterval(timer);
        supabase.removeChannel(channel);
      };
    },

    async issueStudentPass(studentNo, studentName) {
      const data = await rpc<Json>('issue_student_pass', {
        p_slug: slug,
        p_student_no: studentNo,
        p_student_name: studentName,
      });
      return {
        token: String(data.token),
        participantType: 'student',
        displayName: data.display_name ? String(data.display_name) : undefined,
      } satisfies Pass;
    },

    async issueParentPass(code, browserKey) {
      const data = await rpc<Json>('issue_parent_pass', {
        p_slug: slug,
        p_code: code,
        p_browser_key: browserKey,
      });
      return { token: String(data.token), participantType: 'parent' } satisfies Pass;
    },

    async submitPurchase(token, productIds, review) {
      const data = await rpc<Json>('submit_purchase', {
        p_token: token,
        p_product_ids: productIds,
        p_review: review,
      });
      return {
        submissionId: String(data.submission_id),
        productIds: (data.product_ids ?? []).map(String),
        review: String(data.review ?? review),
        participantType: data.participant_type,
        createdAt: String(data.created_at),
      } satisfies SubmitResult;
    },

    async getPublicResults() {
      return mapResults(await rpc<Json>('get_public_results', { p_slug: slug }));
    },

    async getAdminIdentity() {
      const { data } = await getClient().auth.getUser();
      const user = data.user;
      if (!user) return null;
      // 관리자 여부는 서버가 판단한다 (admin_users allowlist)
      const ok = await rpc<boolean>('is_admin_user', {});
      if (!ok) return null;
      return { id: user.id, email: user.email ?? '' };
    },

    async adminSignIn(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw new AppError('auth', '이메일 또는 비밀번호를 확인해 주세요.');
      }
      const ok = await rpc<boolean>('is_admin_user', {});
      if (!ok) {
        await getClient().auth.signOut();
        throw new AppError('not_admin', '관리자로 등록된 계정이 아닙니다.');
      }
      return { id: data.user!.id, email: data.user!.email ?? email };
    },

    async adminSignOut() {
      await getClient().auth.signOut();
    },

    async adminGetTally() {
      return mapTally(await rpc<Json>('admin_get_tally', { p_slug: slug }));
    },

    async adminGetReviews() {
      const rows = await rpc<Json[]>('admin_get_reviews', { p_slug: slug });
      return (rows ?? []).map(
        (r): RawReview => ({
          id: String(r.id),
          participantType: r.participant_type,
          review: String(r.review),
          productIds: (r.product_ids ?? []).map(String),
          createdAt: String(r.created_at),
        }),
      );
    },

    async adminPreviewResults(scope) {
      return mapResults(
        await rpc<Json>('admin_preview_results', {
          p_slug: slug,
          p_scope: scope,
        }),
      );
    },

    async adminSetPhase(phase) {
      await rpc('admin_set_phase', { p_slug: slug, p_phase: phase });
    },

    async adminSetRevealScope(scope) {
      await rpc('admin_set_reveal_scope', { p_slug: slug, p_scope: scope });
    },

    async adminReset(keepRoster) {
      await rpc('admin_reset', { p_slug: slug, p_keep_roster: keepRoster });
    },
  };
}
