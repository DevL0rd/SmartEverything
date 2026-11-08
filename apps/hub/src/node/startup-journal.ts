import { readFile, rename, writeFile } from 'node:fs/promises';
import { env, platform } from 'node:process';
import { COMPUTER_UNIT } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { NodeLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { readStartupJournal } from '../service/startup-journal';
import { shipNodeLogs, type NodeLogShip } from './log-ship';

async function readCursor(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
    return undefined;
  }
}

async function replayStartupJournal(
  layout: NodeLayout,
  deviceId: string,
  ship: NodeLogShip,
  log: Logger,
): Promise<void> {
  if (platform !== 'linux' || env['INVOCATION_ID'] === undefined) return;
  const path = layout.journalCursor(deviceId);
  const batch = await readStartupJournal(COMPUTER_UNIT, await readCursor(path));
  if (batch === null) return;
  if (batch.more) log.warn('journal.more_at_next_start');

  const confirm = async (): Promise<void> => {
    const staged = `${path}.next`;
    await writeFile(staged, batch.cursor, { mode: 0o600, flush: true });
    await rename(staged, path);
  };
  if (batch.records.length === 0) await confirm();
  else ship.replayStartup(batch.records, confirm);
}

export function startNodeLogShipping(
  layout: NodeLayout,
  deviceId: string,
  ship: NodeLogShip,
  log: Logger,
): () => void {
  const stop = shipNodeLogs(ship);
  void replayStartupJournal(layout, deviceId, ship, log).catch((cause: unknown) => {
    log.warn('journal.read_failed', { reason: cause instanceof Error ? cause.name : 'unknown' });
  });
  return stop;
}
