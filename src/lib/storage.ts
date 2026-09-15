/** localStorage는 시크릿 모드/차단 환경에서 예외를 던질 수 있으므로 항상 감싼다 */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 실패해도 화면 흐름은 계속된다 */
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readLocal(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeLocal(key, JSON.stringify(value));
}

export function randomId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** 같은 브라우저를 식별하는 임의 키(개인정보 아님) */
export function browserKey(namespace: string): string {
  const key = `dolmeng.browser.${namespace}`;
  let v = readLocal(key);
  if (!v) {
    v = randomId();
    writeLocal(key, v);
  }
  return v;
}
