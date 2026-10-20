import { messageOf, type Logger } from '@smarteverything/logging';
import { Client } from 'openrgb-sdk';
import type { Rgb } from './colour-math';

export interface OpenRgbMode {
  readonly name: string;
  readonly flagList: readonly string[];
  readonly colors: readonly Rgb[];
}

interface OpenRgbZone {
  readonly name: string;
  readonly ledsCount: number;
}

export interface OpenRgbController {
  readonly name: string;
  readonly vendor?: string | undefined;
  readonly serial: string;
  readonly location: string;
  readonly activeMode: number;
  readonly modes: readonly OpenRgbMode[];
  readonly zones: readonly OpenRgbZone[];
  readonly colors: readonly Rgb[];
}

interface OpenRgbTarget {
  readonly host: string;
  readonly port: number;
}

export type Unsubscribe = () => void;

export interface OpenRgbLink {
  controllers(): Promise<readonly OpenRgbController[]>;
  setLeds(controller: number, colours: readonly Rgb[]): void;
  setZoneLeds(controller: number, zone: number, colours: readonly Rgb[]): void;
  setMode(controller: number, mode: string, colours: readonly Rgb[] | null): Promise<void>;
  profiles(): Promise<readonly string[]>;
  loadProfile(name: string): void;
  saveProfile(name: string): void;
  onListUpdated(listener: () => void): Unsubscribe;
  onClosed(listener: () => void): Unsubscribe;
  close(): void;
}

export type OpenRgbConnector = (target: OpenRgbTarget, log: Logger) => Promise<OpenRgbLink>;

export class OpenRgbConnectionClosedError extends Error {
  override readonly name = 'OpenRgbConnectionClosedError';

  constructor() {
    super('The OpenRGB server closed the connection.');
  }
}

const CLIENT_NAME = 'SmartEverything';
const CONNECT_TIMEOUT_MS = 5_000;
const LIST_UPDATED = 'deviceListUpdated';
const DISCONNECT = 'disconnect';

function untilClosed<T>(client: Client, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const closed = (): void => {
      reject(new OpenRgbConnectionClosedError());
    };
    client.once(DISCONNECT, closed);
    work.then(resolve, reject).finally(() => {
      client.off(DISCONNECT, closed);
    });
  });
}

function subscribe(client: Client, event: string, listener: () => void): Unsubscribe {
  client.on(event, listener);
  return (): void => {
    client.off(event, listener);
  };
}

function plainColours(colours: readonly Rgb[]): { red: number; green: number; blue: number }[] {
  return colours.map(({ red, green, blue }) => ({ red, green, blue }));
}

class SdkLink implements OpenRgbLink {
  constructor(private readonly client: Client) {}

  controllers(): Promise<readonly OpenRgbController[]> {
    return untilClosed(this.client, this.client.getAllControllerData());
  }

  setLeds(controller: number, colours: readonly Rgb[]): void {
    this.client.updateLeds(controller, plainColours(colours));
  }

  setZoneLeds(controller: number, zone: number, colours: readonly Rgb[]): void {
    this.client.updateZoneLeds(controller, zone, plainColours(colours));
  }

  setMode(controller: number, mode: string, colours: readonly Rgb[] | null): Promise<void> {
    const change =
      colours === null ? { name: mode } : { name: mode, colors: plainColours(colours) };
    return untilClosed(this.client, this.client.updateMode(controller, change));
  }

  profiles(): Promise<readonly string[]> {
    return untilClosed(this.client, this.client.getProfileList());
  }

  loadProfile(name: string): void {
    this.client.loadProfile(name);
  }

  saveProfile(name: string): void {
    this.client.saveProfile(name);
  }

  onListUpdated(listener: () => void): Unsubscribe {
    return subscribe(this.client, LIST_UPDATED, listener);
  }

  onClosed(listener: () => void): Unsubscribe {
    if (!this.client.isConnected) {
      queueMicrotask(listener);
    }
    return subscribe(this.client, DISCONNECT, listener);
  }

  close(): void {
    this.client.disconnect();
  }
}

export const connectOpenRgb: OpenRgbConnector = async (target, log) => {
  const client = new Client(CLIENT_NAME, target.port, target.host);
  client.on('error', (cause: unknown) => {
    log.warn('openrgb.socket_failed', { reason: messageOf(cause) });
  });
  try {
    await client.connect(CONNECT_TIMEOUT_MS);
  } catch (cause) {
    client.disconnect();
    throw cause;
  }
  return new SdkLink(client);
};
