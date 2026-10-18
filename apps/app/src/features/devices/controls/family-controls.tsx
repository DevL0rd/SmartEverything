import type { ReactNode } from 'react';
import {
  MICROWAVE_KEYS,
  type DeviceFamily,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import {
  MicrowaveCooking,
  MicrowaveProgramRow,
  MicrowaveQuick,
  MicrowaveTile,
} from '../microwave/cooking';
import { MicrowaveLampRow } from '../microwave/lamp-row';
import { MicrowaveStructuredRow } from '../microwave/structured-row';
import { MICROWAVE_FORM_SPECS } from '../microwave/form-specs';
import { LaundryQuick } from '../laundry/quick';
import { BlasterQuick, RemoteQuick } from '../remote/remote-quick';
import { TelevisionQuick } from '../television/quick';
import { DIFFUSER_MANAGED, DiffuserControls } from '../diffuser/diffuser-controls';

interface FamilyControls {
  readonly primary: (props: { readonly device: Device }) => ReactNode;
  readonly card?: (props: { readonly device: Device }) => ReactNode;
  readonly quick?: (props: { readonly device: Device }) => ReactNode;
  readonly controls?: (props: { readonly device: Device }) => ReactNode;
  readonly managed: ReadonlySet<string>;
  readonly rows: Readonly<
    Record<
      string,
      (props: { readonly device: Device; readonly presented: PresentedCapability }) => ReactNode
    >
  >;
}
const PROGRAM_KEYS = new Set<string>([
  MICROWAVE_KEYS.mode,
  MICROWAVE_KEYS.power,
  MICROWAVE_KEYS.temperature,
  MICROWAVE_KEYS.setDuration,
  MICROWAVE_KEYS.start,
  MICROWAVE_KEYS.pause,
  MICROWAVE_KEYS.stop,
]);
const MICROWAVE_ROWS = Object.fromEntries([
  [MICROWAVE_KEYS.lamp, MicrowaveLampRow] as const,
  ...[...PROGRAM_KEYS].map((key) => [key, MicrowaveProgramRow] as const),
  ...Object.keys(MICROWAVE_FORM_SPECS).map((key) => [key, MicrowaveStructuredRow] as const),
]);
export const FAMILY_CONTROLS: Readonly<Partial<Record<DeviceFamily, FamilyControls>>> = {
  microwave: {
    primary: MicrowaveCooking,
    card: MicrowaveTile,
    quick: MicrowaveQuick,
    controls: MicrowaveCooking,
    managed: PROGRAM_KEYS,
    rows: MICROWAVE_ROWS,
  },
  diffuser: {
    primary: DiffuserControls,
    managed: DIFFUSER_MANAGED,
    rows: {},
  },
  ir_blaster: {
    primary: BlasterQuick,
    quick: BlasterQuick,
    managed: new Set<string>(),
    rows: {},
  },
  ir_remote: {
    primary: RemoteQuick,
    quick: RemoteQuick,
    managed: new Set<string>(),
    rows: {},
  },
  laundry: {
    primary: LaundryQuick,
    managed: new Set<string>(),
    rows: {},
  },
  television: {
    primary: TelevisionQuick,
    managed: new Set<string>(),
    rows: {},
  },
};
