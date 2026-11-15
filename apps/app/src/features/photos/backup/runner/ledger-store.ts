import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { Ledger, STORED_LEDGER } from '../model/ledger';
import type { LedgerStorage, LedgerStores } from './ports';

const log = new Logger('app.photos');

const VERSION_ONE_LEDGER = STORED_LEDGER.extend({
  version: z.literal(1),
  entries: z.array(STORED_LEDGER.shape.entries.element.omit({ itemId: true })),
});

export const LEDGER_STORAGE_KEY = 'smarteverything.photos.backup.ledger';

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    log.warn('backup.ledger_unreadable', {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}

function ledgerOf(raw: string): Ledger | null {
  const value = parseJson(raw);
  const legacy = VERSION_ONE_LEDGER.safeParse(value);
  if (legacy.success) {
    return new Ledger({
      ...legacy.data,
      version: 2,
      entries: legacy.data.entries.map((entry) => ({ ...entry, itemId: null })),
    });
  }
  const parsed = STORED_LEDGER.safeParse(value);
  if (parsed.success) return new Ledger(parsed.data);
  log.warn('backup.ledger_discarded', { reason: parsed.error.message });
  return null;
}

async function legacyLedgerText(storage: LedgerStorage): Promise<string | null> {
  try {
    return await storage.getItem(LEDGER_STORAGE_KEY);
  } catch (cause) {
    log.warn('backup.legacy_ledger_unreadable', {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return '';
  }
}

export async function loadLedger(stores: LedgerStores): Promise<Ledger> {
  const stored = await stores.ledgerFile.read();
  if (stored !== null) return ledgerOf(stored) ?? new Ledger();
  const legacy = await legacyLedgerText(stores.storage);
  if (legacy === null) return new Ledger();
  const ledger = ledgerOf(legacy) ?? new Ledger();
  await saveLedger(stores, ledger);
  await stores.storage.removeItem(LEDGER_STORAGE_KEY);
  log.info('backup.ledger_moved_to_file', { entries: ledger.localIds().size });
  return ledger;
}

export function saveLedger(stores: LedgerStores, ledger: Ledger): Promise<void> {
  return stores.ledgerFile.write(JSON.stringify(ledger.toStored()));
}

export const PAUSED_STORAGE_KEY = 'smarteverything.photos.backup.paused';

export async function loadPaused(storage: LedgerStorage): Promise<boolean> {
  return (await storage.getItem(PAUSED_STORAGE_KEY)) === 'true';
}

export function savePaused(storage: LedgerStorage, paused: boolean): Promise<void> {
  return storage.setItem(PAUSED_STORAGE_KEY, String(paused));
}
