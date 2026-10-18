import { Logger } from '@smarteverything/logging';
import type { LiveSync } from './live-sync';

const log = new Logger('app.store');

export const HIDDEN_REFRESH_MS = 5 * 60_000;

export function followPageVisibility(sync: Pick<LiveSync, 'refresh' | 'online'>): () => void {
  let hiddenAt: number | null = null;
  const change = (): void => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      log.info('page.hidden');
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    log.info('page.visible', { awayMs: away, refresh: away >= HIDDEN_REFRESH_MS });
    if (away >= HIDDEN_REFRESH_MS) sync.refresh();
    else sync.online();
  };
  document.addEventListener('visibilitychange', change);
  return (): void => {
    document.removeEventListener('visibilitychange', change);
  };
}
