import { countryFlag } from '../lib/products';
import type { Product } from '../lib/types';

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
      <span className="product-body">
        <span className="product-head">
          <span className="group-chip">{product.groupNo}모둠</span>
          <span className="product-country">
            <span className="country-flag" aria-hidden="true">
              {countryFlag(product.countryCode)}
            </span>
            {product.countryName}
          </span>
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
