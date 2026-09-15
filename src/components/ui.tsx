import { useEffect, useRef, type ReactNode } from 'react';
import {
  CLASS_SUBTITLE,
  CLASS_TAGLINE,
  CLASS_TITLE,
  DISCLAIMER,
  IS_DEMO,
} from '../lib/config';
import type { Phase } from '../lib/types';

export const PHASE_LABEL: Record<Phase, string> = {
  waiting: '구매 시작 전',
  open: '구매 진행 중',
  closed: '구매 마감',
  revealed: '판매 결과 공개',
};

export function Header({
  phase,
  children,
  wide = false,
}: {
  phase?: Phase;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <header className="header">
      <div className={`wrap ${wide ? 'wrap-wide' : ''}`}>
        <div className="header-inner">
          <div className="header-badges">
            {IS_DEMO && <span className="badge badge-demo">DEMO</span>}
            <span className="badge badge-sale">특가전</span>
            {phase && (
              <span className="badge badge-phase">{PHASE_LABEL[phase]}</span>
            )}
          </div>
          <h1 className="brand">
            <span className="brand-mark" aria-hidden="true">
              ✈
            </span>
            {CLASS_TITLE}
          </h1>
          <p className="header-sub">{CLASS_SUBTITLE}</p>
          <p className="header-tagline">{CLASS_TAGLINE}</p>
          {children}
        </div>
      </div>
    </header>
  );
}

export function FlightBoard({
  live,
  children,
}: {
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flightboard">
      <span className={`dot ${live ? 'live' : ''}`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function Disclaimer() {
  return <p className="disclaimer">{DISCLAIMER}</p>;
}

type NoticeKind = 'info' | 'error' | 'ok' | 'warn';

const NOTICE_ICON: Record<NoticeKind, string> = {
  info: 'i',
  error: '!',
  ok: '✓',
  warn: '!',
};

const NOTICE_PREFIX: Record<NoticeKind, string> = {
  info: '안내',
  error: '오류',
  ok: '완료',
  warn: '확인',
};

/** 색상만으로 상태를 전달하지 않도록 아이콘 + 말머리를 함께 쓴다 */
export function Notice({
  kind = 'info',
  children,
  role,
}: {
  kind?: NoticeKind;
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={role ?? (kind === 'error' ? 'alert' : 'status')}
    >
      <span className="ico" aria-hidden="true">
        {NOTICE_ICON[kind]}
      </span>
      <span>
        <b>{NOTICE_PREFIX[kind]} · </b>
        {children}
      </span>
    </div>
  );
}

export function Button({
  children,
  loading,
  variant = 'default',
  className = '',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: 'default' | 'primary' | 'ghost' | 'quiet' | 'danger';
}) {
  const variantClass =
    variant === 'default' ? '' : `btn-${variant === 'primary' ? 'primary' : variant}`;
  return (
    <button
      type={type}
      className={`btn ${variantClass} ${className}`}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          className={`spinner ${variant === 'primary' || variant === 'ghost' || variant === 'quiet' ? 'dark' : ''}`}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

/** 국가 식별 칩 (문화적 고정관념 없이 ISO 코드 + 국가명) */
export function CountryChip({
  code,
  color,
}: {
  code: string;
  color?: string;
}) {
  return (
    <span
      className="country-chip"
      style={color ? { background: color } : undefined}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function DemoBanner({ notice }: { notice: string }) {
  if (!IS_DEMO) return null;
  return (
    <div className="wrap" style={{ paddingTop: 12 }}>
      <Notice kind="warn">{notice}</Notice>
    </div>
  );
}

export function Loading({ label = '불러오는 중이에요…' }: { label?: string }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <div className="notice notice-info">
        <span className="spinner dark" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
