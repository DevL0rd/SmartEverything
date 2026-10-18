import {
  DETAIL_MIN_WIDTH,
  MASTER_WIDTH,
  areaWidthOf,
  type NavKind,
} from '../../../design/size-class';
import type { Idiom } from '../../../design/tokens';

export type ComposerClass = 'tight' | 'compact' | 'regular';

type AiLayoutMode = 'split' | 'overlay' | 'stack';

export const DOCK_MIN = 400;

export const DOCK_DEFAULT = 480;

export const DOCK_MAX = 800;

const DOCK_DIVIDER = 1;

const GUTTER = 16;

const READING_MAX = 720;

const COMPOSER_TIGHT_BELOW = 400;

const COMPOSER_COMPACT_BELOW = 600;

const SHORT_HEIGHT_BELOW = 480;

export interface AiLayoutInput {
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly idiom: Idiom;
  readonly nav: NavKind;
  readonly sidebarCollapsed: boolean;
  readonly listOpen: boolean;
  readonly chatSelected: boolean;
  readonly dockOpen: boolean;
  readonly dockWidth: number;
}

export interface AiLayout {
  readonly mode: AiLayoutMode;
  readonly areaWidth: number;
  readonly listPane: boolean;
  readonly listSuppressed: boolean;
  readonly dock: 'none' | 'docked' | 'pane';
  readonly dockWidth: number;
  readonly conversationWidth: number;
  readonly readingWidth: number;
  readonly composerClass: ComposerClass;
  readonly heightClass: 'short' | 'normal';
}

interface DockPlan {
  readonly dock: AiLayout['dock'];
  readonly width: number;
  readonly suppressesList: boolean;
}

const NO_DOCK: DockPlan = { dock: 'none', width: 0, suppressesList: false };

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function dockWidthOf(wanted: number, space: number): number {
  return clamp(wanted, DOCK_MIN, Math.min(DOCK_MAX, space - DOCK_DIVIDER));
}

function modeOf(areaWidth: number, idiom: Idiom): AiLayoutMode {
  if (areaWidth >= MASTER_WIDTH + DETAIL_MIN_WIDTH) {
    return 'split';
  }
  return idiom === 'pointer' && areaWidth >= DETAIL_MIN_WIDTH ? 'overlay' : 'stack';
}

function planDock(input: AiLayoutInput, areaWidth: number, listShown: boolean): DockPlan {
  if (!input.dockOpen) {
    return NO_DOCK;
  }
  const wanted = input.idiom === 'touch' ? DOCK_DEFAULT : input.dockWidth;
  const room = areaWidth - (listShown ? MASTER_WIDTH : 0) - DETAIL_MIN_WIDTH;
  if (room - DOCK_DIVIDER >= DOCK_MIN) {
    return { dock: 'docked', width: dockWidthOf(wanted, room), suppressesList: false };
  }
  const withoutList = areaWidth - DETAIL_MIN_WIDTH;
  if (listShown && withoutList - DOCK_DIVIDER >= DOCK_MIN) {
    return { dock: 'docked', width: dockWidthOf(wanted, withoutList), suppressesList: true };
  }
  return { dock: 'pane', width: 0, suppressesList: false };
}

function composerClassOf(readingWidth: number): ComposerClass {
  if (readingWidth < COMPOSER_TIGHT_BELOW) {
    return 'tight';
  }
  return readingWidth < COMPOSER_COMPACT_BELOW ? 'compact' : 'regular';
}

export function aiLayout(input: AiLayoutInput): AiLayout {
  const areaWidth = areaWidthOf(input.windowWidth, input.nav, input.sidebarCollapsed);
  const mode = modeOf(areaWidth, input.idiom);
  const wantsList = mode === 'split' && (input.listOpen || !input.chatSelected);
  const plan = planDock(input, areaWidth, wantsList);
  const listPane = wantsList && !plan.suppressesList;
  const docked = plan.dock === 'docked';
  const conversationWidth =
    areaWidth - (listPane ? MASTER_WIDTH : 0) - (docked ? plan.width + DOCK_DIVIDER : 0);
  const readingWidth = Math.min(conversationWidth - 2 * GUTTER, READING_MAX);
  return {
    mode,
    areaWidth,
    listPane,
    listSuppressed: plan.suppressesList,
    dock: plan.dock,
    dockWidth: plan.width,
    conversationWidth,
    readingWidth,
    composerClass: composerClassOf(readingWidth),
    heightClass: input.windowHeight < SHORT_HEIGHT_BELOW ? 'short' : 'normal',
  };
}
