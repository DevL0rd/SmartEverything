import { MAC_ADDRESS } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

const DEVICE_MAC_ROW = z.object({ device_id: z.string(), mac_address: MAC_ADDRESS });

export class DeviceMacsRepository {
  constructor(private readonly context: StoreContext) {}

  all(): Map<string, string> {
    return new Map(
      this.context.sql
        .all(DEVICE_MAC_ROW, 'select device_id, mac_address from device_macs')
        .map((row) => [row.device_id, row.mac_address]),
    );
  }

  remember(deviceId: string, macAddress: string, learnedAt: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the MAC address learned for a device',
        `insert into device_macs (device_id, mac_address, learned_at) values ($deviceId, $macAddress, $learnedAt)
         on conflict (device_id) do update set mac_address = excluded.mac_address, learned_at = excluded.learned_at`,
        { deviceId, macAddress, learnedAt },
      );
    });
  }
}
