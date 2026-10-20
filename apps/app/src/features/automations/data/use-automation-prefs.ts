import { useMemo } from 'react';
import {
  CLIENT_PREFS,
  type AutomationsBreakpointsPref,
  type AutomationsEditorPref,
  type AutomationsPalettePref,
} from '@smarteverything/domain';
import { usePref, type PrefRead } from '../../../store/prefs';
import {
  withBreakpointToggled,
  withBreakpoints,
  withFavouriteToggled,
  withRecentKind,
} from './prefs-edit';

export type PrefOutcome = 'saved' | 'full' | 'invalid';

export interface AutomationPrefs {
  readonly editor: PrefRead<AutomationsEditorPref>;
  readonly palette: PrefRead<AutomationsPalettePref>;
  readonly breakpoints: PrefRead<AutomationsBreakpointsPref>;
  readonly recordRecentKind: (kind: string) => PrefOutcome;
  readonly toggleFavouriteKind: (kind: string) => PrefOutcome;
  readonly toggleBreakpoint: (automationId: string, nodeId: string) => PrefOutcome;
  readonly setBreakpoints: (automationId: string, nodeIds: readonly string[]) => PrefOutcome;
}

function apply<T>(read: PrefRead<T>, change: (value: T) => T | null): PrefOutcome {
  if (read.status === 'invalid') return 'invalid';
  const next = change(read.value);
  if (next === null) return 'full';
  read.set(next);
  return 'saved';
}

export function useAutomationPrefs(): AutomationPrefs {
  const editor = usePref(CLIENT_PREFS.automations_editor);
  const palette = usePref(CLIENT_PREFS.automations_palette);
  const breakpoints = usePref(CLIENT_PREFS.automations_breakpoints);
  return useMemo(
    () => ({
      editor,
      palette,
      breakpoints,
      recordRecentKind: (kind) => apply(palette, (value) => withRecentKind(value, kind)),
      toggleFavouriteKind: (kind) => apply(palette, (value) => withFavouriteToggled(value, kind)),
      toggleBreakpoint: (automationId, nodeId) =>
        apply(breakpoints, (value) => withBreakpointToggled(value, automationId, nodeId)),
      setBreakpoints: (automationId, nodeIds) =>
        apply(breakpoints, (value) => withBreakpoints(value, automationId, nodeIds)),
    }),
    [editor, palette, breakpoints],
  );
}
