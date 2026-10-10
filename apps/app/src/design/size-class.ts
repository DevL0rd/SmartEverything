import { useWindowDimensions } from 'react-native';
import { appPlatform, useIdiom, type AppPlatform } from './platform';
import type { Idiom, WidthClass } from './tokens';

export type { WidthClass } from './tokens';

type HeightClass = 'compact' | 'medium' | 'expanded';

export type NavKind = 'bar' | 'rail' | 'sidebar';

export type HeaderKind = 'large' | 'standard' | 'desktop';

type SheetKind = 'bottom' | 'dialog';

type BoardColumns = 4 | 8 | 12;

export interface SizeClass {
  readonly width: WidthClass;
  readonly height: HeightClass;
  readonly idiom: Idiom;
  readonly platform: AppPlatform;
  readonly nav: NavKind;
  readonly header: HeaderKind;
  readonly chromeSearch: boolean;
  readonly columns: BoardColumns;
  readonly split: boolean;
  readonly sheet: SheetKind;
}

const WIDTH_BREAKPOINTS = { medium: 600, expanded: 840, large: 1200, xlarge: 1600 } as const;

const HEIGHT_BREAKPOINTS = { medium: 480, expanded: 900 } as const;

export function widthClassOf(width: number): WidthClass {
  if (width >= WIDTH_BREAKPOINTS.xlarge) {
    return 'xlarge';
  }
  if (width >= WIDTH_BREAKPOINTS.large) {
    return 'large';
  }
  if (width >= WIDTH_BREAKPOINTS.expanded) {
    return 'expanded';
  }
  return width >= WIDTH_BREAKPOINTS.medium ? 'medium' : 'compact';
}

function heightClassOf(height: number): HeightClass {
  if (height >= HEIGHT_BREAKPOINTS.expanded) {
    return 'expanded';
  }
  return height >= HEIGHT_BREAKPOINTS.medium ? 'medium' : 'compact';
}

function navOf(width: number, height: HeightClass, idiom: Idiom): NavKind {
  if (idiom === 'pointer') {
    return width >= WIDTH_BREAKPOINTS.expanded ? 'sidebar' : 'rail';
  }
  if (width >= WIDTH_BREAKPOINTS.large) {
    return 'sidebar';
  }
  return width < WIDTH_BREAKPOINTS.medium && height !== 'compact' ? 'bar' : 'rail';
}

function headerOf(nav: NavKind, height: HeightClass, idiom: Idiom): HeaderKind {
  if (nav === 'bar') {
    return 'large';
  }
  if (height === 'compact') {
    return 'standard';
  }
  return nav === 'sidebar' || idiom === 'pointer' ? 'desktop' : 'standard';
}

function columnsOf(width: WidthClass): BoardColumns {
  if (width === 'compact') {
    return 4;
  }
  return width === 'medium' ? 8 : 12;
}

function sizeClassOf(
  width: number,
  height: number,
  idiom: Idiom,
  platform: AppPlatform,
): SizeClass {
  const widthClass = widthClassOf(width);
  const heightClass = heightClassOf(height);
  const nav = navOf(width, heightClass, idiom);
  return {
    width: widthClass,
    height: heightClass,
    idiom,
    platform,
    nav,
    header: headerOf(nav, heightClass, idiom),
    chromeSearch: nav === 'sidebar' || (nav === 'rail' && heightClass !== 'compact'),
    columns: columnsOf(widthClass),
    split: width >= WIDTH_BREAKPOINTS.expanded,
    sheet: idiom === 'touch' ? 'bottom' : 'dialog',
  };
}

export function useSizeClass(): SizeClass {
  const { width, height } = useWindowDimensions();
  const idiom = useIdiom();
  return sizeClassOf(width, height, idiom, appPlatform());
}

export function atLeast(width: WidthClass, floor: WidthClass): boolean {
  const order: readonly WidthClass[] = ['compact', 'medium', 'expanded', 'large', 'xlarge'];
  return order.indexOf(width) >= order.indexOf(floor);
}
