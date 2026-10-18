import { createHash } from 'node:crypto';
import type { DeviceEvent } from '@smarteverything/domain';
import type { ShellyDevice } from '@smarteverything/shelly';
import type { ShellyEvent } from './notifications';
import { shellyZoneValid } from './presence-validity';

export class ShellyCrossings {
  async observe(
    publishEvent: (event: DeviceEvent) => Promise<string>,
    snapshot: ShellyDevice,
    event: ShellyEvent,
  ): Promise<void> {
    if (event.event !== 'enter' && event.event !== 'leave') return;
    const zone = snapshot.zones.find((candidate) => candidate.key === event.component);
    if (zone === undefined || !shellyZoneValid(snapshot, zone)) return;
    const occurrence = createHash('sha256')
      .update(JSON.stringify([snapshot.id, zone.externalId, event]))
      .digest('hex');
    await publishEvent({
      externalId: zone.main ? snapshot.externalId : zone.externalId,
      kind: event.event === 'enter' ? 'zone_enter' : 'zone_leave',
      occurredAt: new Date(event.ts * 1000).toISOString(),
      occurrence,
      details: {
        component: zone.key,
        parentExternalId: snapshot.externalId,
        source: 'shelly',
        generation: zone.generation,
      },
    });
  }
}
