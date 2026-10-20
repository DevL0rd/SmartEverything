import { PRINTER_OPTIONS_VIEW, type PrinterOptions } from '@smarteverything/domain';
import type { ToolCaller } from '../contract';
import { actionsOf } from './device';
import type { PrinterSession } from './session';
import { defaultPrefs } from './settings';
import { refOf, requiredModel } from './views';

const QUALITY_NAMES: ReadonlyMap<number, string> = new Map([
  [3, 'draft'],
  [4, 'normal'],
  [5, 'high'],
]);

function names(
  map: ReadonlyMap<number, string | readonly string[]>,
  values: readonly number[],
): string[] {
  return values.flatMap((value) => map.get(value) ?? []);
}

function prefsOf(session: PrinterSession, caller: ToolCaller): PrinterOptions['prefs'] {
  return session.record.prefs[caller.profileId] ?? defaultPrefs();
}

function defaultsOf(session: PrinterSession): PrinterOptions['defaults'] {
  const { sides, copies } = session.description.defaults;
  const known = sides === null ? undefined : sidesOf(sides);
  return {
    ...(known === undefined ? {} : { sides: known }),
    ...(copies === null ? {} : { copies }),
  };
}

export function optionsView(session: PrinterSession, caller: ToolCaller): PrinterOptions {
  const model = requiredModel(session);
  const caps = session.description.capabilities;
  return PRINTER_OPTIONS_VIEW.parse({
    printer: refOf(session),
    actions: actionsOf(model, caller),
    formats: caps.formats,
    accepts: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    copies: caps.copies,
    sides: caps.sides,
    colorModes: caps.colorModes,
    qualities: names(QUALITY_NAMES, caps.qualities),
    media: caps.media,
    mediaReady: model.status.mediaReady,
    mediaSources: caps.mediaSources,
    mediaTypes: caps.mediaTypes,
    orientations: names(ORIENTATION_NAMES, caps.orientations),
    scalings: caps.scalings,
    outputBins: caps.outputBins,
    contentOptimize: caps.contentOptimize,
    resolutions: caps.resolutions,
    finishings: caps.finishings,
    numberUp: caps.numberUp,
    priorities: caps.priorities,
    holdUntil: caps.holdUntil,
    pageRanges: caps.pageRanges,
    defaults: defaultsOf(session),
    prefs: prefsOf(session, caller),
  });
}

const ORIENTATION_NAMES: ReadonlyMap<number, string> = new Map([
  [3, 'portrait'],
  [4, 'landscape'],
  [5, 'reverseLandscape'],
  [6, 'reversePortrait'],
]);

function sidesOf(
  value: string,
): 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge' | undefined {
  if (value === 'one-sided' || value === 'two-sided-long-edge' || value === 'two-sided-short-edge')
    return value;
  return undefined;
}
