import type { DeviceDriverContext } from '../../../src/local/device-driver';
import type { Rgb } from '../../../src/plugins/builtin/openrgb/colour-math';
import type {
  OpenRgbConnector,
  OpenRgbController,
  OpenRgbLink,
  OpenRgbMode,
  Unsubscribe,
} from '../../../src/plugins/builtin/openrgb/transport';

export const OFF: Rgb = { red: 0, green: 0, blue: 0 };

const DIRECT: OpenRgbMode = { name: 'Direct', flagList: ['perLedColor'], colors: [] };
const STATIC: OpenRgbMode = {
  name: 'Static',
  flagList: ['modeSpecificColor'],
  colors: [{ red: 0, green: 0, blue: 255 }],
};
const RAINBOW: OpenRgbMode = { name: 'Rainbow', flagList: ['speed'], colors: [] };

export function strip(overrides: Partial<OpenRgbController> = {}): OpenRgbController {
  return {
    name: 'Fake strip',
    vendor: 'Acme',
    serial: 'SERIAL-1',
    location: 'HID: fake',
    activeMode: 0,
    modes: [DIRECT, STATIC, RAINBOW],
    zones: [{ name: 'Strip', ledsCount: 4 }],
    colors: [
      { red: 255, green: 0, blue: 0 },
      { red: 255, green: 0, blue: 0 },
      { red: 255, green: 0, blue: 0 },
      { red: 255, green: 0, blue: 0 },
    ],
    ...overrides,
  };
}

export function board(overrides: Partial<OpenRgbController> = {}): OpenRgbController {
  return strip({
    name: 'Fake board',
    serial: '',
    location: 'I2C: bus 1',
    zones: [
      { name: 'Back', ledsCount: 2 },
      { name: 'Front', ledsCount: 2 },
    ],
    colors: [OFF, OFF, OFF, OFF],
    ...overrides,
  });
}

export type LinkCall =
  | { readonly kind: 'leds'; readonly controller: number; readonly colours: readonly Rgb[] }
  | {
      readonly kind: 'zone';
      readonly controller: number;
      readonly zone: number;
      readonly colours: readonly Rgb[];
    }
  | {
      readonly kind: 'mode';
      readonly controller: number;
      readonly mode: string;
      readonly colours: readonly Rgb[] | null;
    }
  | { readonly kind: 'load'; readonly name: string }
  | { readonly kind: 'save'; readonly name: string };

export class FakeLink implements OpenRgbLink {
  readonly calls: LinkCall[] = [];
  closed = false;
  profileNames: string[] = ['Evening'];
  private readonly updates = new Set<() => void>();
  private readonly closers = new Set<() => void>();
  private failing: Error | null = null;

  constructor(public controllerList: readonly OpenRgbController[]) {}

  controllers(): Promise<readonly OpenRgbController[]> {
    return this.failing === null
      ? Promise.resolve(this.controllerList)
      : Promise.reject(this.failing);
  }

  setLeds(controller: number, colours: readonly Rgb[]): void {
    this.calls.push({ kind: 'leds', controller, colours });
  }

  setZoneLeds(controller: number, zone: number, colours: readonly Rgb[]): void {
    this.calls.push({ kind: 'zone', controller, zone, colours });
  }

  setMode(controller: number, mode: string, colours: readonly Rgb[] | null): Promise<void> {
    this.calls.push({ kind: 'mode', controller, mode, colours });
    return Promise.resolve();
  }

  profiles(): Promise<readonly string[]> {
    return Promise.resolve(this.profileNames);
  }

  loadProfile(name: string): void {
    this.calls.push({ kind: 'load', name });
  }

  saveProfile(name: string): void {
    this.calls.push({ kind: 'save', name });
  }

  onListUpdated(listener: () => void): Unsubscribe {
    this.updates.add(listener);
    return (): void => {
      this.updates.delete(listener);
    };
  }

  onClosed(listener: () => void): Unsubscribe {
    this.closers.add(listener);
    return (): void => {
      this.closers.delete(listener);
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.dropped();
  }

  announceListChange(controllers: readonly OpenRgbController[]): void {
    this.controllerList = controllers;
    for (const listener of this.updates) {
      listener();
    }
  }

  failReads(cause: Error): void {
    this.failing = cause;
  }

  dropped(): void {
    for (const listener of this.closers) {
      listener();
    }
  }
}

export interface FakeServer {
  readonly links: FakeLink[];
  readonly attempts: () => number;
  readonly connector: OpenRgbConnector;
  readonly refuse: (reason: Error | null) => void;
}

export function fakeServer(
  first: () => OpenRgbController[],
  onLink: (link: FakeLink, attempt: number) => void = () => undefined,
): FakeServer {
  const links: FakeLink[] = [];
  let attempts = 0;
  let refusal: Error | null = null;
  return {
    links,
    attempts: () => attempts,
    refuse: (reason): void => {
      refusal = reason;
    },
    connector: (): Promise<OpenRgbLink> => {
      attempts += 1;
      if (refusal !== null) {
        return Promise.reject(refusal);
      }
      const link = new FakeLink(first());
      onLink(link, attempts);
      links.push(link);
      return Promise.resolve(link);
    },
  };
}

export interface DriverRecording {
  readonly context: DeviceDriverContext;
  readonly devices: Parameters<DeviceDriverContext['sink']['devices']>[0][];
  readonly states: Parameters<DeviceDriverContext['sink']['state']>[0][];
}

export function recordDriver(signal: AbortSignal): DriverRecording {
  const devices: DriverRecording['devices'] = [];
  const states: DriverRecording['states'] = [];
  const context: DeviceDriverContext = {
    sink: {
      state: (update) => {
        states.push(update);
      },
      event: () => undefined,
      online: () => undefined,
      devices: (published) => {
        devices.push(published);
      },
      failure: () => undefined,
    },
    publishEvent: () => Promise.resolve('event'),
    publishDevices: () => Promise.resolve(),
    signal,
    forget: () => Promise.resolve(),
  };
  return { context, devices, states };
}
