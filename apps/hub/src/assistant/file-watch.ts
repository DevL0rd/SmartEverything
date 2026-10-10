import { statSync, unwatchFile, watch, watchFile as pollStats, type Stats } from 'node:fs';
import { basename, dirname } from 'node:path';

const MAC_POLL_MS = 500;

function signature(stats: Stats | undefined): string {
  return stats !== undefined && stats.nlink > 0
    ? `${String(stats.ino)}:${String(stats.mtimeMs)}:${String(stats.size)}`
    : 'missing';
}

function currentSignature(path: string): string {
  return signature(statSync(path, { throwIfNoEntry: false }));
}

function macPoll(path: string, changed: () => void, reported: () => string): () => void {
  if (process.platform !== 'darwin') {
    return () => undefined;
  }
  const listener = (current: Stats): void => {
    if (signature(current) !== reported()) {
      changed();
    }
  };
  pollStats(path, { persistent: false, interval: MAC_POLL_MS }, listener);
  return () => {
    unwatchFile(path, listener);
  };
}

interface Watched {
  readonly directory: string;
  readonly polled: string;
  readonly matches: (file: string | null) => boolean;
  readonly settleMs: number;
}

function settledWatch(watched: Watched, onChange: () => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  let reported = currentSignature(watched.polled);
  const settled = (): void => {
    reported = currentSignature(watched.polled);
    onChange();
  };
  const changed = (): void => {
    clearTimeout(timer);
    timer = setTimeout(settled, watched.settleMs);
  };
  const watcher = watch(watched.directory, { persistent: false }, (_event, file) => {
    if (watched.matches(file)) {
      changed();
    }
  });
  watcher.on('error', changed);
  const stopPoll = macPoll(watched.polled, changed, () => reported);
  return () => {
    clearTimeout(timer);
    watcher.close();
    stopPoll();
  };
}

export function watchFile(path: string, onChange: () => void, settleMs = 50): () => void {
  const name = basename(path);
  return settledWatch(
    {
      directory: dirname(path),
      polled: path,
      matches: (file) => file === null || file === name,
      settleMs,
    },
    onChange,
  );
}

export function watchDirectory(directory: string, onChange: () => void, settleMs = 50): () => void {
  return settledWatch({ directory, polled: directory, matches: () => true, settleMs }, onChange);
}
