import type { AirBand, DeviceFamily } from '@smarteverything/domain';
import type { ReactNode } from 'react';

export type VisualSize = 'tile' | 'card' | 'hero';

export type VisualPower = 'on' | 'off' | 'unknown';

export type ThermalMode = 'heat' | 'cool' | 'idle';

export interface VisualReading {
  readonly text: string;
  readonly unit: string | null;
  readonly at: string;
}

export interface VisualState {
  readonly power: VisualPower;
  readonly online: boolean;
  readonly level: number;
  readonly band: AirBand | null;
  readonly target: number | null;
  readonly targetShare: number | null;
  readonly current: number | null;
  readonly oscillating: boolean;
  readonly angle: number | null;
  readonly colour: string | null;
  readonly ambientLight: boolean | null;
  readonly waterLow: boolean;
  readonly waterLevel: number | null;
  readonly thermal: ThermalMode;
  readonly locked: boolean | null;
  readonly position: number | null;
  readonly progress: number | null;
  readonly battery: number | null;
  readonly pulse: number | null;
  readonly syncing: boolean;
  readonly load: number | null;
  readonly reading: VisualReading | null;
  readonly source: string | null;
  readonly presence: boolean | null;
}

export type VisualTone = 'active' | 'idle' | 'offline';

export interface VisualProps {
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px: number;
  readonly tone: VisualTone;
  readonly moving: boolean;
  readonly reduced: boolean;
}

export type VisualComponent = (props: VisualProps) => ReactNode;

export type VisualRegistry = Readonly<Record<DeviceFamily, VisualComponent>>;
