import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';
import { ValueStore, useValue } from './external-store';
import { SharedSource } from './shared-source';
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
  readonly area: number;
  readonly split: boolean;
  readonly sheet: SheetKind;
}

const WIDTH_BREAKPOINTS = { medium: 600, expanded: 840, large: 1200, xlarge: 1600 } as const;

const HEIGHT_BREAKPOINTS = { medium: 480, expanded: 900 } as const;

const NAV_WIDTH: Readonly<Record<NavKind, number>> = { bar: 0, rail: 80, sidebar: 264 };

const SIDEBAR_COLLAPSED_WIDTH = 72;

export const MASTER_WIDTH = 300;

export const DETAIL_MIN_WIDTH = 560;

const MASTER_DETAIL_MIN = MASTER_WIDTH + DETAIL_MIN_WIDTH;

const collapsedSidebar = new ValueStore<boolean>(false);

export function setSidebarCollapsed(collapsed: boolean): void {
  collapsedSidebar.set(collapsed);
}

export function areaWidthOf(windowWidth: number, nav: NavKind, sidebarCollapsed: boolean): number {
  const navWidth = nav === 'sidebar' && sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : NAV_WIDTH[nav];
  return windowWidth - navWidth;
}

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

interface Surface {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
  readonly platform: AppPlatform;
  readonly sidebarCollapsed: boolean;
}

function sizeClassOf({ width, height, idiom, platform, sidebarCollapsed }: Surface): SizeClass {
  const widthClass = widthClassOf(width);
  const heightClass = heightClassOf(height);
  const nav = navOf(width, heightClass, idiom);
  const area = areaWidthOf(width, nav, sidebarCollapsed);
  return {
    width: widthClass,
    height: heightClass,
    idiom,
    platform,
    nav,
    header: headerOf(nav, heightClass, idiom),
    chromeSearch: nav === 'sidebar' || (nav === 'rail' && heightClass !== 'compact'),
    columns: columnsOf(widthClass),
    area,
    split: area >= MASTER_DETAIL_MIN,
    sheet: idiom === 'touch' ? 'bottom' : 'dialog',
  };
}

interface WindowBands {
  readonly width: number;
  readonly height: number;
}

let bands: WindowBands = { width: 0, height: 0 };

function bandOfHeight(height: number): number {
  if (height >= HEIGHT_BREAKPOINTS.expanded) return HEIGHT_BREAKPOINTS.expanded;
  return height >= HEIGHT_BREAKPOINTS.medium ? HEIGHT_BREAKPOINTS.medium : 0;
}

function readBands(): WindowBands {
  const { width, height } = Dimensions.get('window');
  const band = bandOfHeight(height);
  if (bands.width !== width || bands.height !== band) bands = { width, height: band };
  return bands;
}

const windowChanges = new SharedSource((notify) => {
  const subscription = Dimensions.addEventListener('change', notify);
  return (): void => {
    subscription.remove();
  };
});

const subscribeBands = windowChanges.subscribe;

export function useSizeClass(): SizeClass {
  const { width, height } = useSyncExternalStore(subscribeBands, readBands, readBands);
  const idiom = useIdiom();
  const sidebarCollapsed = useValue(collapsedSidebar);
  return sizeClassOf({ width, height, idiom, platform: appPlatform(), sidebarCollapsed });
}

export function useIsPhone(): boolean {
  const { idiom, width } = useSizeClass();
  return idiom === 'touch' && (width === 'compact' || width === 'medium');
}

export function useAreaWidth(): number {
  return useSizeClass().area;
}

export function atLeast(width: WidthClass, floor: WidthClass): boolean {
  const order: readonly WidthClass[] = ['compact', 'medium', 'expanded', 'large', 'xlarge'];
  return order.indexOf(width) >= order.indexOf(floor);
}
