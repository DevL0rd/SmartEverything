import type { ReactNode } from 'react';
import type { Brand } from '../../components/brand-glyphs';
import { BrandMark } from '../../components/brand-mark';
import { useIdiom } from '../../design/platform';

export function RowBrand({ brand }: { readonly brand: Brand }): ReactNode {
  return <BrandMark brand={brand} size={useIdiom() === 'touch' ? 40 : 32} />;
}
