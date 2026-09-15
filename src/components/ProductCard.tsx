import { PLACEHOLDER_TAGLINE } from '../lib/products';
import type { Product } from '../lib/types';
import { CountryChip } from './ui';

/** 대표 사진이 없을 때 쓰는 자리표시자 (외부 이미지 없이도 완성된 화면) */
function MediaFallback({ color }: { color: string }) {
  return (
    <>
      <svg
        viewBox="0 0 320 180"
        width="100%"
        height="100%"
        role="img"
        aria-label="대표 사진 자리"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <linearGradient id={`sky-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dceafa" />
            <stop offset="100%" stopColor="#f4f9ff" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#sky-${color.replace('#', '')})`} />
        {/* 해 */}
        <circle cx="268" cy="38" r="16" fill={color} opacity="0.2" />
        {/* 비행 경로 + 종이비행기 */}
        <path
          d="M26 96 C 86 44 150 34 214 46"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="5 7"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
        <g transform="translate(212 32) rotate(14)">
          <path d="M0 0 L34 12 L0 24 L8 12 Z" fill={color} opacity="0.7" />
        </g>
        {/* 산과 땅 */}
        <path d="M0 142 L66 100 L118 142 Z" fill={color} opacity="0.28" />
        <path d="M84 142 L158 86 L228 142 Z" fill={color} opacity="0.46" />
        <path d="M198 142 L262 106 L320 142 Z" fill={color} opacity="0.24" />
        <rect y="142" width="320" height="38" fill={color} opacity="0.12" />
      </svg>
      <span className="media-fallback" style={{ position: 'relative' }}>
        <span aria-hidden="true">📷</span>
        <span>대표 사진 자리 (자리표시자)</span>
      </span>
    </>
  );
}

export function ProductCard({
  product,
  selected,
  onToggle,
  disabled,
  selectHint,
}: {
  product: Product;
  selected: boolean;
  onToggle: (id: string) => void;
  disabled?: boolean;
  /** 선택 버튼에 보여줄 문구 (기본: 이 상품 선택) */
  selectHint?: string;
}) {
  const isPlaceholder =
    !product.tagline || product.tagline === PLACEHOLDER_TAGLINE;

  return (
    <button
      type="button"
      className={`product ${selected ? 'is-selected' : ''}`}
      onClick={() => onToggle(product.id)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${product.groupNo}모둠 ${product.countryName} 여행 상품${selected ? ' (선택됨)' : ''}`}
    >
      <span className="product-strip" style={{ background: product.themeColor }} />
      <span className="product-media">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={`${product.countryName} 여행 상품 대표 사진`}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <MediaFallback color={product.themeColor} />
        )}
        {selected && (
          <span className="selected-ribbon">
            <span aria-hidden="true">✓</span> 선택함
          </span>
        )}
      </span>
      <span className="product-body">
        <span className="product-head">
          <span className="group-chip">{product.groupNo}모둠</span>
          <CountryChip code={product.countryCode} color={product.themeColor} />
        </span>
        <span className="product-country">{product.countryName}</span>
        <span
          className={`product-tagline ${isPlaceholder ? 'is-placeholder' : ''}`}
        >
          {isPlaceholder ? PLACEHOLDER_TAGLINE : product.tagline}
        </span>
        <span className="select-state">
          <span className="select-label">
            <span className="check" aria-hidden="true">
              ✓
            </span>
            {selected ? '선택함' : '선택 안 함'}
          </span>
          <span className="pick-hint">
            {selected ? '선택 취소' : (selectHint ?? '이 상품 선택')}
          </span>
        </span>
      </span>
    </button>
  );
}
