import type { IconName } from '../../../../components/icon';
import type { WidthClass } from '../../../../design/size-class';
import type { ProblemCounts } from '../problems/problem-model';

export type EditorLayout = 'phone' | 'tablet' | 'wide';

export const OFFLINE_PUBLISH_REASON = 'Reconnect to publish';

export const OFFLINE_BANNER = {
  title: 'Can’t reach the Home Hub',
  body: 'Your last change is not saved. Reconnect to publish.',
} as const;

export const SHEET_HALF_SHARE = 0.5;

export function editorLayoutOf(width: WidthClass): EditorLayout {
  if (width === 'compact') return 'phone';
  return width === 'medium' || width === 'expanded' ? 'tablet' : 'wide';
}

export interface TopBarInput {
  readonly layout: EditorLayout;
  readonly online: boolean;
  readonly reusable: boolean;
  readonly counts: ProblemCounts;
}

export interface TopBarModel {
  readonly publishLabel: string;
  readonly publishName: string;
  readonly publishDisabled: boolean;
  readonly problemText: string | null;
  readonly problemTone: 'critical' | 'warning' | 'info' | null;
  readonly sentence: boolean;
  readonly testButton: boolean;
  readonly addButton: boolean;
  readonly breadcrumb: boolean;
}

export function problemText(counts: ProblemCounts): string | null {
  if (counts.errors > 0) return `${String(counts.errors)} to fix`;
  if (counts.warnings > 0) return `${String(counts.warnings)} to know`;
  if (counts.hints > 0) return `${String(counts.hints)} to improve`;
  return null;
}

function problemTone(counts: ProblemCounts): TopBarModel['problemTone'] {
  if (counts.errors > 0) return 'critical';
  if (counts.warnings > 0) return 'warning';
  return counts.hints > 0 ? 'info' : null;
}

export function topBarModel({ layout, online, reusable, counts }: TopBarInput): TopBarModel {
  const publishLabel = reusable ? 'Publish node' : 'Publish';
  return {
    publishLabel,
    publishName: online ? publishLabel : OFFLINE_PUBLISH_REASON,
    publishDisabled: !online,
    problemText: problemText(counts),
    problemTone: problemTone(counts),
    sentence: layout !== 'phone',
    testButton: layout !== 'phone',
    addButton: layout === 'tablet',
    breadcrumb: layout === 'wide',
  };
}

export type BottomItemId = 'add' | 'select' | 'test' | 'runs' | 'interface';

export interface BottomItem {
  readonly id: BottomItemId;
  readonly label: string;
  readonly icon: IconName;
  readonly active: boolean;
  readonly disabled: boolean;
}

export interface BottomBarInput {
  readonly reusable: boolean;
  readonly selecting: boolean;
}

export function bottomBarItems({ reusable, selecting }: BottomBarInput): readonly BottomItem[] {
  return [
    { id: 'add', label: 'Add', icon: 'plus', active: false, disabled: false },
    {
      id: 'select',
      label: selecting ? 'Done' : 'Select',
      icon: selecting ? 'check' : 'squareMousePointer',
      active: selecting,
      disabled: false,
    },
    { id: 'test', label: 'Test', icon: 'play', active: false, disabled: false },
    reusable
      ? { id: 'interface', label: 'Interface', icon: 'puzzle', active: false, disabled: false }
      : { id: 'runs', label: 'Runs', icon: 'activity', active: false, disabled: false },
  ];
}

export function sheetInset(layout: EditorLayout, sheetOpen: boolean, windowHeight: number): number {
  return layout === 'phone' && sheetOpen ? Math.round(windowHeight * SHEET_HALF_SHARE) : 0;
}

export interface InspectorTargetInput {
  readonly ids: readonly string[];
  readonly selecting: boolean;
}

export function inspectorTarget({ ids, selecting }: InspectorTargetInput): string | null {
  const [only] = ids;
  return !selecting && ids.length === 1 && only !== undefined ? only : null;
}

export function selectedText(count: number): string {
  return `${String(count)} selected`;
}

export interface PaneSizes {
  readonly palette: number;
  readonly inspector: number;
  readonly problems: number;
}

export const PANE_DEFAULTS: Readonly<Record<EditorLayout, PaneSizes>> = {
  phone: { palette: 0, inspector: 0, problems: 0 },
  tablet: { palette: 320, inspector: 360, problems: 360 },
  wide: { palette: 280, inspector: 380, problems: 380 },
};

export const PANE_LIMITS = { min: 240, max: 560 } as const;
