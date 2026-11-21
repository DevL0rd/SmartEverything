import type { StoreHost } from '../../store/host/host';
import type { StoredRoomLink } from '../../store/repositories/vacuum-room-links';

interface DeviceLinks {
  readonly deviceId: string;
}

export class VacuumLinkRows {
  private readonly rows = new Map<string, ReadonlyMap<number, string>>();
  private readonly asks = new Map<string, number>();

  constructor(private readonly host: StoreHost) {}

  fill(links: readonly (StoredRoomLink & DeviceLinks)[]): void {
    const grouped = new Map<string, StoredRoomLink[]>();
    for (const link of links) {
      const rows = grouped.get(link.deviceId);
      if (rows === undefined) grouped.set(link.deviceId, [link]);
      else rows.push(link);
    }
    for (const [deviceId, rows] of grouped) this.rows.set(deviceId, presentOf(rows));
  }

  present(deviceId: string): ReadonlyMap<number, string> {
    return this.rows.get(deviceId) ?? new Map<number, string>();
  }

  async refresh(deviceId: string): Promise<void> {
    const ask = (this.asks.get(deviceId) ?? 0) + 1;
    this.asks.set(deviceId, ask);
    const links = await this.host.call('vacuumRoomLinks', 'list', deviceId);
    if (this.asks.get(deviceId) !== ask) return;
    this.rows.set(deviceId, presentOf(links));
  }

  removed(deviceId: string): void {
    this.rows.delete(deviceId);
    this.asks.delete(deviceId);
  }
}

function presentOf(links: readonly StoredRoomLink[]): ReadonlyMap<number, string> {
  return new Map(
    links.filter((link) => link.missingSince === null).map((link) => [link.mapRoomId, link.roomId]),
  );
}
