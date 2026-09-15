import { CLASS_SUBTITLE, CLASS_TAGLINE, CLASS_TITLE } from '../config';
import { buildProducts } from '../products';
import { buildPublicResults, type RawReview } from '../ranking';
import {
  AppError,
  type AdminTally,
  type ParticipantType,
  type Pass,
  type Phase,
  type Product,
  type ProductTally,
  type PublicResults,
  type PublicSession,
  type RevealScope,
  type SubmitResult,
} from '../types';
import { assertChoices, assertReview, normalizeStudentName } from '../validation';
import type { Backend, DemoSeedKind } from './types';

/* -------------------------------------------------------------------------
 * demo mode 저장소
 * 실제 Supabase 데이터와 완전히 분리된 별도 키(localStorage)에만 저장한다.
 * 테스트에서는 메모리 저장소를 주입한다.
 * ---------------------------------------------------------------------- */

export const DEMO_STORAGE_KEY = 'dolmeng.demo.v1';
export const DEMO_PARENT_CODE = 'TRAVEL';
export const DEMO_STUDENT_COUNT = 18;

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

function localStore(): KeyValueStore {
  return {
    get(k) {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* noop */
      }
    },
    remove(k) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* noop */
      }
    },
  };
}

interface DemoPass {
  id: string;
  token: string;
  participantType: ParticipantType;
  used: boolean;
  browserKey: string | null;
  issuedAt: string;
  usedAt: string | null;
}

interface DemoSubmission {
  id: string;
  participantType: ParticipantType;
  review: string;
  productIds: string[];
  createdAt: string;
}

interface DemoRosterRow {
  studentNo: number;
  name: string;
  isActive: boolean;
  passId: string | null;
}

export interface DemoState {
  version: number;
  phase: Phase;
  revealScope: RevealScope;
  parentCode: string;
  studentCapacity: number;
  products: Product[];
  roster: DemoRosterRow[];
  passes: DemoPass[];
  submissions: DemoSubmission[];
  adminEmail: string | null;
  updatedAt: string;
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const c = globalThis.crypto;
  const rand =
    c && 'randomUUID' in c
      ? c.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}

/** demo 명단은 실제 학생 이름이 아닌 자리표시자("체험1" ~ "체험18")다 */
function demoRoster(): DemoRosterRow[] {
  return Array.from({ length: DEMO_STUDENT_COUNT }, (_, i) => ({
    studentNo: i + 1,
    name: `체험${i + 1}`,
    isActive: true,
    passId: null,
  }));
}

export function initialDemoState(): DemoState {
  return {
    version: 1,
    phase: 'waiting',
    revealScope: 'none',
    parentCode: DEMO_PARENT_CODE,
    studentCapacity: DEMO_STUDENT_COUNT,
    products: buildProducts('demo'),
    roster: demoRoster(),
    passes: [],
    submissions: [],
    adminEmail: null,
    updatedAt: new Date().toISOString(),
  };
}

export interface DemoBackendOptions {
  store?: KeyValueStore;
  /** 브라우저 탭 간 동기화를 쓸지 여부 (테스트에서는 false) */
  broadcast?: boolean;
}

export function createDemoBackend(options: DemoBackendOptions = {}): Backend {
  const store =
    options.store ??
    (typeof window !== 'undefined' ? localStore() : memoryStore());
  const useBroadcast =
    options.broadcast ?? typeof window !== 'undefined';

  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | null = null;

  function notifyLocal() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* 구독자 오류가 전체를 막지 않게 */
      }
    });
  }

  function read(): DemoState {
    const raw = store.get(DEMO_STORAGE_KEY);
    if (!raw) {
      const fresh = initialDemoState();
      store.set(DEMO_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    try {
      const parsed = JSON.parse(raw) as DemoState;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.products)) {
        throw new Error('bad state');
      }
      return parsed;
    } catch {
      const fresh = initialDemoState();
      store.set(DEMO_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
  }

  function write(next: DemoState) {
    next.updatedAt = new Date().toISOString();
    store.set(DEMO_STORAGE_KEY, JSON.stringify(next));
    notifyLocal();
    if (useBroadcast) {
      try {
        channel ??= new BroadcastChannel('dolmeng-demo');
        channel.postMessage({ t: next.updatedAt });
      } catch {
        /* BroadcastChannel 미지원 브라우저는 폴링으로 동작 */
      }
    }
  }

  function mutate(fn: (s: DemoState) => void) {
    const s = read();
    fn(s);
    write(s);
    return s;
  }

  function requireAdmin(s: DemoState) {
    if (!s.adminEmail) {
      throw new AppError('not_admin', '교사 로그인이 필요합니다.');
    }
  }

  function toPublicSession(s: DemoState): PublicSession {
    return {
      slug: 'demo',
      title: CLASS_TITLE,
      subtitle: CLASS_SUBTITLE,
      tagline: CLASS_TAGLINE,
      phase: s.phase,
      revealScope: s.revealScope,
      products: s.products
        .filter((p) => p.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder),
      studentCapacity: s.studentCapacity,
      updatedAt: s.updatedAt,
    };
  }

  function tallyOf(s: DemoState): AdminTally {
    const counts = new Map<string, ProductTally>();
    for (const p of s.products) {
      counts.set(p.id, {
        productId: p.id,
        groupNo: p.groupNo,
        countryName: p.countryName,
        countryCode: p.countryCode,
        themeColor: p.themeColor,
        sold: 0,
        studentSold: 0,
        parentSold: 0,
      });
    }
    let studentParticipants = 0;
    let parentParticipants = 0;
    for (const sub of s.submissions) {
      if (sub.participantType === 'student') studentParticipants += 1;
      else parentParticipants += 1;
      for (const pid of new Set(sub.productIds)) {
        const row = counts.get(pid);
        if (!row) continue;
        row.sold += 1;
        if (sub.participantType === 'student') row.studentSold += 1;
        else row.parentSold += 1;
      }
    }
    const studentTickets = studentParticipants;
    const parentTickets = parentParticipants * 2;
    return {
      phase: s.phase,
      revealScope: s.revealScope,
      studentParticipants,
      studentCapacity: s.studentCapacity,
      parentParticipants,
      totalParticipants: studentParticipants + parentParticipants,
      issuedTickets: studentTickets + parentTickets,
      studentTickets,
      parentTickets,
      products: [...counts.values()].sort((a, b) => a.groupNo - b.groupNo),
      countedAt: new Date().toISOString(),
    };
  }

  function reviewsOf(s: DemoState): RawReview[] {
    return s.submissions.map((sub) => ({
      id: sub.id,
      participantType: sub.participantType,
      review: sub.review,
      productIds: sub.productIds,
      createdAt: sub.createdAt,
    }));
  }

  function findPass(s: DemoState, token: string): DemoPass {
    const pass = s.passes.find((p) => p.token === token);
    if (!pass) {
      throw new AppError(
        'invalid_pass',
        '참여권을 확인할 수 없어요. 처음 화면부터 다시 들어와 주세요.',
      );
    }
    return pass;
  }

  const backend: Backend = {
    kind: 'demo',

    async getPublicSession() {
      return toPublicSession(read());
    },

    subscribeSession(onChange) {
      listeners.add(onChange);
      let stopped = false;
      let last = read().updatedAt;

      const poll = setInterval(() => {
        if (stopped) return;
        const now = read().updatedAt;
        if (now !== last) {
          last = now;
          onChange();
        }
      }, 1500);

      let onMessage: ((e: MessageEvent) => void) | null = null;
      let onStorage: ((e: StorageEvent) => void) | null = null;
      if (useBroadcast) {
        try {
          channel ??= new BroadcastChannel('dolmeng-demo');
          onMessage = () => onChange();
          channel.addEventListener('message', onMessage);
        } catch {
          /* noop */
        }
        try {
          onStorage = (e: StorageEvent) => {
            if (e.key === DEMO_STORAGE_KEY) onChange();
          };
          window.addEventListener('storage', onStorage);
        } catch {
          /* noop */
        }
      }

      return () => {
        stopped = true;
        clearInterval(poll);
        listeners.delete(onChange);
        if (channel && onMessage) channel.removeEventListener('message', onMessage);
        if (onStorage) {
          try {
            window.removeEventListener('storage', onStorage);
          } catch {
            /* noop */
          }
        }
      };
    },

    async issueStudentPass(studentNo, studentName) {
      const s = read();
      const wanted = normalizeStudentName(studentName);
      const row = s.roster.find(
        (r) =>
          r.studentNo === studentNo &&
          r.isActive &&
          normalizeStudentName(r.name) === wanted,
      );
      if (!row) {
        throw new AppError(
          'roster_mismatch',
          '번호와 이름이 명단과 달라요. 다시 확인해 주세요.',
        );
      }
      if (row.passId) {
        const existing = s.passes.find((p) => p.id === row.passId);
        if (existing && existing.used) {
          throw new AppError(
            'already_purchased',
            '이미 구매를 마쳤어요. 다시 참여할 수는 없어요.',
          );
        }
        if (existing) {
          // 아직 사용하지 않은 참여권이면 새 토큰으로 갈아끼운다(기기 변경 대비)
          existing.token = uid('tok');
          existing.issuedAt = new Date().toISOString();
          write(s);
          return {
            token: existing.token,
            participantType: 'student',
            displayName: row.name,
          };
        }
      }
      const pass: DemoPass = {
        id: uid('pass'),
        token: uid('tok'),
        participantType: 'student',
        used: false,
        browserKey: null,
        issuedAt: new Date().toISOString(),
        usedAt: null,
      };
      s.passes.push(pass);
      row.passId = pass.id;
      write(s);
      return { token: pass.token, participantType: 'student', displayName: row.name };
    },

    async issueParentPass(code, browserKey) {
      const s = read();
      const normalized = code.replace(/\s+/g, '').toUpperCase();
      if (normalized !== s.parentCode.toUpperCase()) {
        throw new AppError(
          'bad_parent_code',
          '참여 코드가 달라요. 화면에 안내된 코드를 다시 확인해 주세요.',
        );
      }
      const existing = s.passes.find(
        (p) => p.participantType === 'parent' && p.browserKey === browserKey,
      );
      if (existing) {
        if (existing.used) {
          throw new AppError(
            'already_purchased',
            '이 기기에서는 이미 구매를 마쳤어요.',
          );
        }
        return { token: existing.token, participantType: 'parent' };
      }
      const pass: DemoPass = {
        id: uid('pass'),
        token: uid('tok'),
        participantType: 'parent',
        used: false,
        browserKey,
        issuedAt: new Date().toISOString(),
        usedAt: null,
      };
      s.passes.push(pass);
      write(s);
      return { token: pass.token, participantType: 'parent' };
    },

    async submitPurchase(token, productIds, review) {
      const s = read();
      const pass = findPass(s, token);
      if (s.phase === 'waiting') {
        throw new AppError('not_open', '아직 구매가 시작되지 않았어요.');
      }
      if (s.phase !== 'open') {
        throw new AppError(
          'not_open',
          '구매가 마감되었어요. 결과 발표를 기다려 주세요.',
        );
      }
      if (pass.used) {
        throw new AppError('already_purchased', '이미 구매를 마쳤어요.');
      }
      assertChoices(pass.participantType, productIds);
      const known = new Set(s.products.filter((p) => p.isActive).map((p) => p.id));
      if (!productIds.every((id) => known.has(id))) {
        throw new AppError('unknown_product', '고른 여행 상품을 찾을 수 없어요.');
      }
      const clean = assertReview(review);

      const submission: DemoSubmission = {
        id: uid('sub'),
        participantType: pass.participantType,
        review: clean,
        productIds: [...productIds],
        createdAt: new Date().toISOString(),
      };
      // 참여권 사용 처리와 구매 저장을 함께 기록한다(demo에서는 단일 write = 트랜잭션)
      pass.used = true;
      pass.usedAt = submission.createdAt;
      s.submissions.push(submission);
      write(s);

      return {
        submissionId: submission.id,
        productIds: submission.productIds,
        review: submission.review,
        participantType: submission.participantType,
        createdAt: submission.createdAt,
      };
    },

    async getPublicResults() {
      const s = read();
      if (s.phase !== 'revealed') {
        throw new AppError(
          'not_revealed',
          '결과는 아직 공개되지 않았어요.',
        );
      }
      return buildPublicResults(tallyOf(s), reviewsOf(s), s.revealScope, s.phase);
    },

    async getAdminIdentity() {
      const s = read();
      return s.adminEmail
        ? { id: 'demo-admin', email: s.adminEmail, demo: true }
        : null;
    },

    async adminSignIn(email) {
      const s = mutate((st) => {
        st.adminEmail = email.trim() || 'demo-teacher@example.com';
      });
      return { id: 'demo-admin', email: s.adminEmail!, demo: true };
    },

    async adminSignOut() {
      mutate((st) => {
        st.adminEmail = null;
      });
    },

    async adminGetTally() {
      const s = read();
      requireAdmin(s);
      return tallyOf(s);
    },

    async adminGetReviews() {
      const s = read();
      requireAdmin(s);
      return reviewsOf(s);
    },

    async adminPreviewResults(scope) {
      const s = read();
      requireAdmin(s);
      return buildPublicResults(tallyOf(s), reviewsOf(s), scope, s.phase);
    },

    async adminSetPhase(phase) {
      mutate((st) => {
        requireAdmin(st);
        st.phase = phase;
        if (phase !== 'revealed') st.revealScope = 'none';
      });
    },

    async adminSetRevealScope(scope) {
      mutate((st) => {
        requireAdmin(st);
        st.revealScope = scope;
      });
    },

    async adminReset(keepRoster) {
      mutate((st) => {
        requireAdmin(st);
        st.submissions = [];
        st.passes = [];
        st.phase = 'waiting';
        st.revealScope = 'none';
        if (keepRoster) {
          st.roster.forEach((r) => {
            r.passId = null;
          });
        } else {
          st.roster = demoRoster();
        }
      });
    },

    async demoSeed(kind: DemoSeedKind) {
      mutate((st) => {
        requireAdmin(st);
        st.submissions = [];
        st.passes = [];
        st.roster.forEach((r) => {
          r.passId = null;
        });
        const ids = st.products.map((p) => p.id);
        const add = (
          type: ParticipantType,
          picks: string[],
          review: string,
        ) => {
          st.submissions.push({
            id: uid('sub'),
            participantType: type,
            review,
            productIds: picks,
            createdAt: new Date().toISOString(),
          });
        };
        const s1 = (n: number, pid: string) => {
          for (let i = 0; i < n; i += 1)
            add('student', [pid], `(체험) 이 여행 상품이 기대돼요 ${i + 1}`);
        };
        const p1 = (n: number, a: string, b: string) => {
          for (let i = 0; i < n; i += 1)
            add('parent', [a, b], `(체험) 두 곳 모두 가 보고 싶어요 ${i + 1}`);
        };

        if (kind === 'clear') return;
        if (kind === 'normal') {
          s1(6, ids[1]);
          s1(5, ids[3]);
          s1(4, ids[0]);
          s1(2, ids[2]);
          s1(1, ids[4]);
          p1(3, ids[1], ids[3]);
          p1(2, ids[0], ids[2]);
        } else if (kind === 'tie-first') {
          // 공동 1위 2개
          s1(6, ids[0]);
          s1(6, ids[1]);
          s1(3, ids[2]);
          s1(2, ids[3]);
          s1(1, ids[4]);
          p1(2, ids[0], ids[1]);
        } else if (kind === 'tie-boundary') {
          // 1위 1개 + 공동 2위 2개 (TOP 2 공개 시 3개 공개)
          s1(8, ids[0]);
          s1(5, ids[1]);
          s1(5, ids[2]);
          s1(3, ids[3]);
          s1(1, ids[4]);
          p1(2, ids[1], ids[2]);
        } else if (kind === 'with-zero') {
          // 0장 상품 포함
          s1(7, ids[0]);
          s1(4, ids[1]);
          s1(2, ids[2]);
          p1(2, ids[0], ids[1]);
        }
      });
    },

    demoParentCodeHint() {
      return read().parentCode;
    },

    demoRosterHint() {
      const s = read();
      return `번호 1~${s.roster.length}, 이름은 "체험" + 번호 (예: 1번 / 체험1)`;
    },
  };

  return backend;
}

/** 테스트용: 순수 메모리 demo backend */
export function createTestBackend(): Backend {
  return createDemoBackend({ store: memoryStore(), broadcast: false });
}

export type { PublicResults, PublicSession, SubmitResult, Pass };
