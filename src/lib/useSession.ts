import { useCallback, useEffect, useRef, useState } from 'react';
import { backend } from './backend';
import { AppError, type PublicSession } from './types';

/**
 * 공개 수업 상태 구독.
 * Supabase Realtime(또는 demo의 BroadcastChannel) + 짧은 주기 폴링을 함께 사용해
 * 교사가 상태를 바꾸면 참여자 화면이 새로고침 없이 전환되도록 한다.
 */
export function useSession() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const s = await backend().getPublicSession();
      if (!alive.current) return;
      setSession(s);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(
        e instanceof AppError
          ? e.message
          : '연결이 잠시 끊겼어요. 다시 시도할게요.',
      );
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const stop = backend().subscribeSession(() => void load());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      alive.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [load]);

  return { session, error, loading, reload: load };
}

/** 느린 요청을 사용자에게 알리기 위한 지연 감지 */
export function useSlowFlag(active: boolean, delayMs = 4000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return slow;
}
