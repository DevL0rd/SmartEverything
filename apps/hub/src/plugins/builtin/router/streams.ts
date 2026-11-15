import type { RouterInventory, RouterLive, RouterSnapshot } from '@smarteverything/domain';

export const SNAPSHOT_STREAM = 'router.snapshot';
export const LIVE_STREAM = 'router.live';

export function liveOf(snapshot: RouterSnapshot): RouterLive {
  return {
    at: snapshot.at,
    connection: snapshot.connection,
    cadence: snapshot.cadence,
    intervalSeconds: snapshot.intervalSeconds,
    system: snapshot.system,
    network: snapshot.network,
    stations: snapshot.stations,
  };
}

export function inventoryOf(snapshot: RouterSnapshot): RouterInventory {
  return {
    at: snapshot.at,
    info: snapshot.info,
    radios: snapshot.radios,
    clients: snapshot.clients,
    people: snapshot.people,
  };
}

function signatureOf(inventory: RouterInventory): string {
  return JSON.stringify({
    radios: inventory.radios,
    clients: inventory.clients.map((client) => ({ ...client, trafficBytesPerSecond: null })),
    people: inventory.people,
    info: inventory.info === null ? null : { ...inventory.info, uptimeSeconds: 0 },
  });
}

export class RouterStreams {
  #published: string | null = null;

  constructor(
    private readonly send: (stream: string, value: RouterLive | RouterInventory) => void,
  ) {}

  publish(snapshot: RouterSnapshot, full: boolean): void {
    this.send(LIVE_STREAM, liveOf(snapshot));
    const inventory = inventoryOf(snapshot);
    const signature = signatureOf(inventory);
    if (full || signature !== this.#published) {
      this.#published = signature;
      this.send(SNAPSHOT_STREAM, inventory);
    }
  }
}
