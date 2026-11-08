import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { Ledger, STORED_LEDGER } from '../model/ledger';
import type { LedgerStorage } from './ports';

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

export async function loadLedger(storage: LedgerStorage): Promise<Ledger> {
  const raw = await storage.getItem(LEDGER_STORAGE_KEY);
  if (raw === null) return new Ledger();
  const value = parseJson(raw);
  const legacy = VERSION_ONE_LEDGER.safeParse(value);
  if (legacy.success) {
    const ledger = new Ledger({
      ...legacy.data,
      version: 2,
      entries: legacy.data.entries.map((entry) => ({ ...entry, itemId: null })),
    });
    await saveLedger(storage, ledger);
    return ledger;
  }
  const parsed = STORED_LEDGER.safeParse(value);
  if (parsed.success) return new Ledger(parsed.data);
  log.warn('backup.ledger_discarded', { reason: parsed.error.message });
  return new Ledger();
}

export function saveLedger(storage: LedgerStorage, ledger: Ledger): Promise<void> {
  return storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger.toStored()));
}

export const PAUSED_STORAGE_KEY = 'smarteverything.photos.backup.paused';

export async function loadPaused(storage: LedgerStorage): Promise<boolean> {
  return (await storage.getItem(PAUSED_STORAGE_KEY)) === 'true';
}

export function savePaused(storage: LedgerStorage, paused: boolean): Promise<void> {
  return storage.setItem(PAUSED_STORAGE_KEY, String(paused));
}
