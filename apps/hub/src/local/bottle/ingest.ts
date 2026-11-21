import type {
  AdapterSink,
  BottleSyncResult,
  BottleSyncUpload,
  ClientRow,
  DeviceRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { FleetRoster } from '../fleet-roster';
import { IngestQueues } from '../ingest-queue';
import type { LocalDevices } from '../local-devices';
import { replayNotes } from '../unit-notes';
import { publishStates } from './publisher';

export interface IngestDeps {
  readonly store: Pick<Store, 'host'>;
  readonly roster: Pick<FleetRoster, 'use' | 'entryOf'>;
  readonly sink: () => AdapterSink;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly now: () => Date;
  readonly log: Logger;
}

export class BottleIngest {
  private readonly queues = new IngestQueues();

  constructor(private readonly deps: IngestDeps) {}

  idle(): Promise<void> {
    return this.queues.idle();
  }

  process(
    device: DeviceRow,
    client: Pick<ClientRow, 'id'>,
    upload: BottleSyncUpload,
  ): Promise<BottleSyncResult> {
    return this.queues.run(device.id, () => this.sync(device, client, upload));
  }

  private async sync(
    device: DeviceRow,
    client: Pick<ClientRow, 'id'>,
    upload: BottleSyncUpload,
  ): Promise<BottleSyncResult> {
    const { deps } = this;
    const entry = deps.roster.entryOf(device.external_id);
    const done = await deps.store.host.write('bottleSync', {
      device,
      entry,
      clientId: client.id,
      upload,
      now: deps.now().toISOString(),
    });
    replayNotes(deps.log, done.notes);
    deps.roster.use(done.entry);
    for (const event of done.events) {
      deps.sink().event(event);
    }
    publishStates(deps.sink(), done.publish);
    await deps.local.observe(entry.externalId, done.observed);
    return { accepted: upload.responses.length, plan: done.plan };
  }
}
