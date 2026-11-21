import { HUB_UNIT } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { readStartupJournal } from '../service/startup-journal';
import { storedFromLog } from '../store/repositories/runtime-log-types';
import type { Store } from '../store/store';
import type { LogStore } from '../logs/log-store';

const KEY = 'startup-journal.hub';
const SOURCE = 'hub:startup-journal';
const CLIENT = 'hub';

export async function storeStartupJournal(
  store: Store,
  logs: Pick<LogStore, 'append'>,
  log: Logger,
): Promise<void> {
  const saved = await store.host.call('settingsKv', 'read', KEY);
  const batch = await readStartupJournal(HUB_UNIT, saved?.['cursor']);
  if (batch === null) return;
  if (batch.more) log.warn('journal.more_at_next_start');
  const now = store.now().toISOString();
  const placement = { source: SOURCE, clientId: CLIENT, deviceId: null, now };
  const records = batch.records
    .map((record) => storedFromLog(record, placement))
    .filter((record) => record !== null);

  if (records.length > 0) {
    await logs.append(
      records,
      { source: SOURCE, runtime: 'hub', platform: 'server', deviceId: null, clientId: CLIENT },
      now,
    );
  }
  await store.host.call('settingsKv', 'save', KEY, { cursor: batch.cursor });
}
