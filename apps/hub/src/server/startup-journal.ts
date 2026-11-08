import { HUB_UNIT } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { readStartupJournal } from '../service/startup-journal';
import { storedFromLog } from '../store/repositories/runtime-log-types';
import type { Store } from '../store/store';

const KEY = 'startup-journal.hub';
const SOURCE = 'hub:startup-journal';
const CLIENT = 'hub';

export async function storeStartupJournal(store: Store, log: Logger): Promise<void> {
  const batch = await readStartupJournal(HUB_UNIT, store.settingsKv.read(KEY)?.['cursor']);
  if (batch === null) return;
  if (batch.more) log.warn('journal.more_at_next_start');
  const now = store.now().toISOString();
  const placement = { source: SOURCE, clientId: CLIENT, deviceId: null, now };
  const records = batch.records
    .map((record) => storedFromLog(record, placement))
    .filter((record) => record !== null);

  if (records.length > 0) {
    const kept = store.runtimeLogs.append(records, CLIENT);
    store.runtimeLogs.touch({ ...placement, runtime: 'hub', platform: 'server' }, now, kept, 0);
  }
  store.settingsKv.save(KEY, { cursor: batch.cursor });
}
