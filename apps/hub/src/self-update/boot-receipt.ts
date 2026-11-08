import { readFile } from 'node:fs/promises';
import { HUB_UPDATE_BOOT_RECEIPT, HUB_UPDATE_BOOT_RECEIPT_FILE } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export async function hubBootRun(log: Pick<Logger, 'warn'>): Promise<string | undefined> {
  try {
    const file = new URL(HUB_UPDATE_BOOT_RECEIPT_FILE, import.meta.url);
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    return HUB_UPDATE_BOOT_RECEIPT.parse(raw).runId;
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
      log.warn('hub_update.boot_receipt_unreadable');
    return undefined;
  }
}
