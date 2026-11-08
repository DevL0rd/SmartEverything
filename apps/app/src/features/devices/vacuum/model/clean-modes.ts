import type { DevicePresentation, JsonValue, PresentedCapability } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import { presentedFor } from './presented-refs';

export interface ModeSegment {
  readonly value: string;
  readonly label: string;
  readonly spoken: string;
  readonly icon?: IconName;
}

export interface ModeControl {
  readonly presented: PresentedCapability;
  readonly title: string;
  readonly segments: readonly ModeSegment[];
  readonly note: string | null;
}

interface ModeSpec {
  readonly ref: string;
  readonly title: string;
  readonly short: Readonly<Record<string, string>>;
  readonly icons: Readonly<Record<string, IconName>>;
  readonly note: string | null;
}

export const VACUUM_ONLY_MODE = 'Sweep';
export const WATER_OFF = 'Off';

const MODE_SPECS: readonly ModeSpec[] = [
  {
    ref: 'vacuum_mode',
    title: 'Mode',
    short: { Sweep: 'Vacuum', 'Sweep Mop': 'Vac + mop', 'Sweep Before Mopping': 'Mop after' },
    icons: { Sweep: 'vacuum', 'Sweep Mop': 'droplet', 'Sweep Before Mopping': 'layers' },
    note: null,
  },
  { ref: 'suction', title: 'Suction', short: {}, icons: {}, note: null },
  { ref: 'mop_level', title: 'Water', short: {}, icons: {}, note: null },
  { ref: 'vacuum_sweep_route', title: 'Route', short: {}, icons: {}, note: null },
  {
    ref: 'vacuum_repeats',
    title: 'Passes',
    short: { 'Three Time': '3 times' },
    icons: {},
    note: 'Applies to the next clean. Passes go back to once after it docks.',
  },
];

function segmentsOf(presented: PresentedCapability, spec: ModeSpec): readonly ModeSegment[] {
  return presented.options.map((option) => {
    const icon = spec.icons[option.value];
    return {
      value: option.value,
      label: spec.short[option.value] ?? option.label,
      spoken: option.label,
      ...(icon === undefined ? {} : { icon }),
    };
  });
}

export function shownSegments(
  control: ModeControl,
  mode: JsonValue | undefined,
): readonly ModeSegment[] {
  if (control.presented.role !== 'mop_level' || mode === VACUUM_ONLY_MODE) {
    return control.segments;
  }
  return control.segments.filter((segment) => segment.value !== WATER_OFF);
}

export function modeControlsOf(presentation: DevicePresentation): readonly ModeControl[] {
  return MODE_SPECS.flatMap((spec) => {
    const presented = presentedFor(presentation, spec.ref);
    if (presented === undefined || !presented.writable || presented.options.length === 0) {
      return [];
    }
    return [
      { presented, title: spec.title, segments: segmentsOf(presented, spec), note: spec.note },
    ];
  });
}

export function optionLabel(control: ModeControl, value: JsonValue | undefined): string | null {
  return control.presented.options.find((option) => option.value === value)?.label ?? null;
}

export function modesSummary(
  controls: readonly ModeControl[],
  values: Readonly<Record<string, JsonValue | undefined>>,
): string {
  return controls
    .flatMap((control) => {
      const label = optionLabel(control, values[control.presented.key]);
      return label === null ? [] : [label];
    })
    .join(' · ');
}

export const CLEAN_MODE_REFS: readonly string[] = MODE_SPECS.map((spec) => spec.ref);
