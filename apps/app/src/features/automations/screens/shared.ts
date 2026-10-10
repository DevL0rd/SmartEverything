import type { WidthClass } from '../../../design/size-class';

export function isMasterWidth(width: WidthClass): boolean {
  return width === 'large' || width === 'xlarge';
}

export function subtitleProp(subtitle: string | undefined): { readonly subtitle?: string } {
  return subtitle === undefined ? {} : { subtitle };
}
