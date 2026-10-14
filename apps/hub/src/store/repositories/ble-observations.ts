import { z } from 'zod';
import type { StoreContext } from '../context';

const CURSOR = z.object({
  device_id: z.string(),
  key_epoch: z.string(),
  counter: z.int().min(0).max(0xffffffff),
  frame_hash: z.string(),
  seen_at: z.string(),
  received_at: z.string(),
});

export type BleObservationCursor = z.infer<typeof CURSOR>;

export class BleObservationsRepository {
  constructor(private readonly context: StoreContext) {}

  cursor(deviceId: string, keyEpoch: string): BleObservationCursor | undefined {
    return this.context.sql.get(
      CURSOR,
      'select * from ble_observation_cursors where device_id = $deviceId and key_epoch = $keyEpoch',
      { deviceId, keyEpoch },
    );
  }

  save(cursor: BleObservationCursor): void {
    this.context.sql.run(
      'record the authenticated Bluetooth observation',
      `insert into ble_observation_cursors (device_id, key_epoch, counter, frame_hash, seen_at, received_at)
       values ($device_id, $key_epoch, $counter, $frame_hash, $seen_at, $received_at)
       on conflict(device_id, key_epoch) do update set counter = excluded.counter,
         frame_hash = excluded.frame_hash, seen_at = excluded.seen_at, received_at = excluded.received_at`,
      cursor,
    );
  }
}
