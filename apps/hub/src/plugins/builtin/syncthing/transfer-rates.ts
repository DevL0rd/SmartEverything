import { perSecond } from '@smarteverything/domain';
import type { Connections } from './rest-schemas';

interface Rate {
  readonly inBytesPerSecond: number;
  readonly outBytesPerSecond: number;
}

const IDLE: Rate = { inBytesPerSecond: 0, outBytesPerSecond: 0 };

interface Sample {
  readonly at: number;
  readonly total: { readonly in: number; readonly out: number };
  readonly devices: ReadonlyMap<string, { readonly in: number; readonly out: number }>;
}

function rateOf(
  now: { readonly in: number; readonly out: number },
  before: { readonly in: number; readonly out: number } | undefined,
  seconds: number,
): Rate {
  return {
    inBytesPerSecond: perSecond(now.in, before?.in, seconds),
    outBytesPerSecond: perSecond(now.out, before?.out, seconds),
  };
}

export class TransferRates {
  #previous: Sample | null = null;
  #total: Rate = IDLE;
  #baselined = false;
  #devices = new Map<string, Rate>();

  get ready(): boolean {
    return this.#baselined;
  }

  get total(): Rate {
    return this.#total;
  }

  device(id: string): Rate {
    return this.#devices.get(id) ?? IDLE;
  }

  sample(connections: Connections, at: number): void {
    const current: Sample = {
      at,
      total: { in: connections.total.inBytesTotal, out: connections.total.outBytesTotal },
      devices: new Map(
        Object.entries(connections.connections).map(([id, connection]) => [
          id,
          { in: connection.inBytesTotal, out: connection.outBytesTotal },
        ]),
      ),
    };
    const previous = this.#previous;
    this.#baselined = previous !== null;
    const seconds = previous === null ? 0 : (at - previous.at) / 1000;
    this.#total = rateOf(current.total, previous?.total, seconds);
    this.#devices = new Map(
      [...current.devices].map(([id, totals]) => [
        id,
        connections.connections[id]?.connected === true
          ? rateOf(totals, previous?.devices.get(id), seconds)
          : IDLE,
      ]),
    );
    this.#previous = current;
  }

  reset(): void {
    this.#previous = null;
    this.#baselined = false;
    this.#total = IDLE;
    this.#devices = new Map();
  }
}
