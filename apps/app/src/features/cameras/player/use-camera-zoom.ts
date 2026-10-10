import { useRef, useState } from 'react';
import { presentDevice, withRole } from '@smarteverything/domain';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';

export interface CameraZoom {
  readonly supported: boolean;
  readonly level: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly preview: (level: number) => void;
  readonly commit: (level: number) => void;
  readonly toggle: () => void;
  readonly reset: () => void;
}

interface ZoomRange {
  readonly key: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

const UNITS_PER_X = 10;
const TOGGLED_X = 2;

function zoomRangeOf(device: Device): ZoomRange | null {
  const zoom = withRole(presentDevice(device), 'zoom');
  const value = zoom?.capability.value;
  if (zoom === undefined || !zoom.writable || value?.kind !== 'number') {
    return null;
  }
  return { key: zoom.key, min: value.min, max: value.max, step: value.step };
}

function clampTo(range: ZoomRange, units: number): number {
  return Math.min(range.max, Math.max(range.min, Math.round(units / range.step) * range.step));
}

function useSender(set: (value: number) => Promise<boolean>): (units: number) => void {
  const busy = useRef(false);
  const next = useRef<number | null>(null);
  const send = (units: number): void => {
    if (busy.current) {
      next.current = units;
      return;
    }
    busy.current = true;
    void set(units).finally(() => {
      busy.current = false;
      const queued = next.current;
      next.current = null;
      if (queued !== null && queued !== units) {
        send(queued);
      }
    });
  };
  return send;
}

const NO_RANGE: ZoomRange = { key: 'zoom', min: UNITS_PER_X, max: UNITS_PER_X, step: 1 };

export function useCameraZoom(device: Device): CameraZoom {
  const range = zoomRangeOf(device);
  const shown = range ?? NO_RANGE;
  const control = useControl(device.id, shown.key);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const send = useSender(control.set);
  const reported = typeof control.value === 'number' ? control.value : shown.min;
  const units = previewing ?? reported;
  const commit = (level: number): void => {
    const target = clampTo(shown, level * UNITS_PER_X);
    setPreviewing(null);
    if (range !== null && target !== reported) {
      send(target);
    }
  };
  return {
    supported: range !== null,
    level: units / UNITS_PER_X,
    min: shown.min / UNITS_PER_X,
    max: shown.max / UNITS_PER_X,
    step: shown.step / UNITS_PER_X,
    preview: (level): void => {
      const target = clampTo(shown, level * UNITS_PER_X);
      setPreviewing(target);
      if (range !== null) {
        send(target);
      }
    },
    commit,
    toggle: (): void => {
      commit(units > shown.min ? shown.min / UNITS_PER_X : TOGGLED_X);
    },
    reset: (): void => {
      commit(shown.min / UNITS_PER_X);
    },
  };
}
