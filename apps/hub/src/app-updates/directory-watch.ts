import { background, type Logger } from '@smarteverything/logging';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';

export interface DirectoryWatchOptions {
  readonly directory: string;
  readonly mode?: number;
  readonly relevant: (name: string) => boolean;
  readonly reload: (initial: boolean) => Promise<void>;
  readonly log: Logger;
  readonly reloadFailed: string;
  readonly watchFailed: string;
}

export interface DirectoryWatch {
  stop(): Promise<void>;
}

function failedFile(cause: unknown): { readonly file: string } | undefined {
  if (cause instanceof Error && 'file' in cause && typeof cause.file === 'string') {
    return { file: cause.file };
  }
  return undefined;
}

function open(options: DirectoryWatchOptions, changed: () => void): FSWatcher {
  const failed = (cause: unknown): void => {
    options.log.error(options.watchFailed, cause, { directory: options.directory });
  };
  try {
    const watcher = watch(options.directory, (_event, name) => {
      if (name === null || options.relevant(name)) changed();
    });
    watcher.on('error', failed);
    return watcher;
  } catch (cause) {
    failed(cause);
    throw cause;
  }
}

export async function startDirectoryWatch(options: DirectoryWatchOptions): Promise<DirectoryWatch> {
  await mkdir(options.directory, {
    recursive: true,
    ...(options.mode === undefined ? {} : { mode: options.mode }),
  });
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (initial: boolean): Promise<void> => {
    queue = queue
      .then(() => options.reload(initial))
      .catch((cause: unknown) => {
        options.log.error(options.reloadFailed, cause, failedFile(cause));
      });
    return queue;
  };
  const first = enqueue(true);
  const watcher = open(options, () => {
    background(enqueue(false), options.reloadFailed);
  });
  await first;
  return {
    stop: async (): Promise<void> => {
      watcher.close();
      await queue;
    },
  };
}
