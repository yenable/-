/**
 * 환경 변수 / 실행 모드 판별.
 * - Supabase 연결 정보가 없으면 자동으로 demo mode로 내려간다(로컬 실행 편의).
 * - 운영 빌드에서는 ?demo=1 쿼리만으로 demo mode가 켜지지 않는다.
 */
const env = import.meta.env;

export const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const SESSION_SLUG = (env.VITE_SESSION_SLUG ?? 'default').trim();

const PLACEHOLDER = /YOUR-|example\.com|CHANGE-?ME/i;

export const hasSupabaseConfig =
  SUPABASE_URL.startsWith('http') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !PLACEHOLDER.test(SUPABASE_URL) &&
  !PLACEHOLDER.test(SUPABASE_ANON_KEY);

const demoByEnv = String(env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true';
const allowDemoQuery =
  env.DEV || String(env.VITE_ALLOW_DEMO_QUERY ?? '').toLowerCase() === 'true';

function queryHasDemo(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  const v = p.get('demo');
  return v === '1' || v === 'true';
}

export type DemoReason = 'env' | 'query' | 'missing-config' | null;

function resolveDemo(): { demo: boolean; reason: DemoReason } {
  if (demoByEnv) return { demo: true, reason: 'env' };
  if (allowDemoQuery && queryHasDemo()) return { demo: true, reason: 'query' };
  if (!hasSupabaseConfig) return { demo: true, reason: 'missing-config' };
  return { demo: false, reason: null };
}

const resolved = resolveDemo();
export const IS_DEMO = resolved.demo;
export const DEMO_REASON = resolved.reason;

/** 화면 상단 배너 문구 */
export const DEMO_NOTICE =
  DEMO_REASON === 'missing-config'
    ? 'Supabase 설정이 없어 demo mode로 실행 중입니다. 입력한 내용은 이 브라우저에만 저장됩니다.'
    : 'demo mode로 실행 중입니다. 입력한 내용은 이 브라우저에만 저장됩니다.';

export const DISCLAIMER =
  '이 사이트의 구매는 수업용 가상 체험이며 실제 결제가 이루어지지 않습니다.';

export const CLASS_TITLE = '돌멩홈쇼핑';
export const CLASS_SUBTITLE = '세계 여행 특가전';
export const CLASS_TAGLINE = '지형과 기후를 담은 최고의 여행 상품을 찾아라!';
