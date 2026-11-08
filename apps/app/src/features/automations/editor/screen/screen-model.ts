import type { NodeKindLookup } from '@smarteverything/domain';
import { execClassOf, type ProgramV4 } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import type { WidthClass } from '../../../../design/size-class';
import { countsText, type ProblemCounts } from '../problems/problem-model';

export type EditorLayout = 'phone' | 'tablet' | 'wide';

export const OFFLINE_PUBLISH_REASON = 'Reconnect to publish';

export const OFFLINE_TEST = 'Test needs the Home Hub. Reconnect, then test again.';

export const EMPTY_PUBLISH_REASON = 'Add the first step to publish';

export const EMPTY_TEST_REASON = 'Add what starts it and a step to test';

export const OFFLINE_BANNER = {
  title: 'Can’t reach the Home Hub',
  body: 'Your last change is not saved. Reconnect to publish.',
} as const;

export const SHEET_HALF_SHARE = 0.5;

export function hasNoSteps(program: ProgramV4, kinds: NodeKindLookup): boolean {
  return program.nodes.every((node) => execClassOf(node.kind, kinds) === 'start');
}

export function editorLayoutOf(width: WidthClass): EditorLayout {
  if (width === 'compact') return 'phone';
  return width === 'medium' || width === 'expanded' ? 'tablet' : 'wide';
}

export interface TopBarInput {
  readonly layout: EditorLayout;
  readonly online: boolean;
  readonly reusable: boolean;
  readonly empty: boolean;
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
  readonly testDisabled: boolean;
  readonly undoButtons: boolean;
  readonly addButton: boolean;
  readonly breadcrumb: boolean;
}

export function problemText(counts: ProblemCounts): string | null {
  return countsText(counts);
}

function problemTone(counts: ProblemCounts): TopBarModel['problemTone'] {
  if (counts.errors > 0) return 'critical';
  if (counts.warnings > 0) return 'warning';
  return counts.hints > 0 ? 'info' : null;
}

function publishNameOf(input: TopBarInput, label: string): string {
  if (!input.online) return OFFLINE_PUBLISH_REASON;
  return input.empty ? EMPTY_PUBLISH_REASON : label;
}

export function topBarModel(input: TopBarInput): TopBarModel {
  const { layout, online, reusable, empty, counts } = input;
  const publishLabel = reusable ? 'Publish node' : 'Publish';
  return {
    publishLabel,
    publishName: publishNameOf(input, publishLabel),
    publishDisabled: !online || empty,
    problemText: problemText(counts),
    problemTone: problemTone(counts),
    sentence: layout !== 'phone',
    testButton: layout !== 'phone',
    testDisabled: empty,
    undoButtons: layout !== 'phone',
    addButton: layout === 'tablet',
    breadcrumb: layout === 'wide',
  };
}

export type BottomItemId = 'undo' | 'redo' | 'add' | 'select' | 'test' | 'runs' | 'interface';

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
  readonly empty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function bottomBarItems({
  reusable,
  selecting,
  empty,
  canUndo,
  canRedo,
}: BottomBarInput): readonly BottomItem[] {
  return [
    { id: 'undo', label: 'Undo', icon: 'undo', active: false, disabled: !canUndo },
    { id: 'redo', label: 'Redo', icon: 'redo', active: false, disabled: !canRedo },
    { id: 'add', label: 'Add', icon: 'plus', active: false, disabled: false },
    {
      id: 'select',
      label: selecting ? 'Done' : 'Select',
      icon: selecting ? 'check' : 'squareMousePointer',
      active: selecting,
      disabled: false,
    },
    { id: 'test', label: 'Test', icon: 'play', active: false, disabled: empty },
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
