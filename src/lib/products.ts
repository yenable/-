import type { Product } from './types';

/**
 * 모둠 · 국가 정보만 실제 데이터이고,
 * 소개 문구와 대표 이미지는 아직 정해지지 않은 "자리표시자"다.
 * 실제 운영에서는 DB(travel_products) 값을 수정해서 사용한다.
 * (supabase/seed/products.sql 참고)
 */
export const PLACEHOLDER_TAGLINE = '(자리표시자) 모둠 소개 문구를 넣어 주세요';

/**
 * ISO 3166-1 alpha-2 코드를 국기 이모지로 바꾼다.
 * 덴마크 DK 🇩🇰 / 일본 JP 🇯🇵 / 필리핀 PH 🇵🇭 / 캐나다 CA 🇨🇦 / 사우디아라비아 SA 🇸🇦
 * (코드가 비어 있거나 두 글자가 아니면 빈 문자열 — 카드에는 국가명만 보인다)
 */
export function countryFlag(code: string): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(
    ...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export interface ProductSeed {
  groupNo: number;
  countryName: string;
  countryCode: string;
  themeColor: string;
}

export const PRODUCT_SEEDS: ProductSeed[] = [
  { groupNo: 1, countryName: '덴마크', countryCode: 'DK', themeColor: '#c8102e' },
  { groupNo: 2, countryName: '일본', countryCode: 'JP', themeColor: '#d64550' },
  { groupNo: 3, countryName: '필리핀', countryCode: 'PH', themeColor: '#0a7bc4' },
  { groupNo: 4, countryName: '캐나다', countryCode: 'CA', themeColor: '#e04b3a' },
  {
    groupNo: 5,
    countryName: '사우디아라비아',
    countryCode: 'SA',
    themeColor: '#0f7a52',
  },
];

export function buildProducts(idPrefix = 'p'): Product[] {
  return PRODUCT_SEEDS.map((s, i) => ({
    id: `${idPrefix}${s.groupNo}`,
    groupNo: s.groupNo,
    countryName: s.countryName,
    countryCode: s.countryCode,
    displayOrder: i + 1,
    tagline: PLACEHOLDER_TAGLINE,
    imageUrl: null,
    themeColor: s.themeColor,
    isActive: true,
  }));
}
