import type { BrushBrand } from '@smarteverything/domain';

export interface BrandText {
  readonly label: string;
  readonly maker: string;
  readonly appName: string;
  readonly blurb: string;
}

export const BRAND_TEXT: Readonly<Record<BrushBrand, BrandText>> = {
  sonicare: {
    label: 'Philips Sonicare',
    maker: 'Philips',
    appName: 'Philips Sonicare app',
    blurb: 'A Bluetooth Sonicare that logs every brushing and tells you when to change the head',
  },
  oralb: {
    label: 'Oral-B iO',
    maker: 'Oral-B',
    appName: 'Oral-B app',
    blurb: 'An iO series brush with quarters, pressure, a head countdown and every brushing',
  },
};
