import { useState } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { deleteRecording, removeEvent } from '../../../api/media';
import { notify } from '../../../components/toast-store';
import type { Removal } from '../logic/event-entries';

const log = new Logger('app.cameras');

export interface Hidden {
  readonly hidden: ReadonlySet<string>;
  readonly remove: (key: string, removal: Removal, what: string) => void;
}

function commitDelete(input: {
  readonly key: string;
  readonly removal: Removal;
  readonly what: string;
  readonly restore: (key: string) => void;
  readonly onDeleted: () => void;
}): void {
  const { key, removal, what, restore, onDeleted } = input;
  const startedAt = Date.now();
  background(
    Promise.all([
      ...removal.eventIds.map(removeEvent),
      ...removal.recordingIds.map(deleteRecording),
    ]).then(
      () => {
        log.info('delete.finished', { key, latencyMs: Date.now() - startedAt });
        onDeleted();
      },
      (error: unknown) => {
        log.error('delete.failed', error, { key, latencyMs: Date.now() - startedAt });
        restore(key);
        notify({ message: `${what} wasn’t deleted`, error, tone: 'critical' });
      },
    ),
    'promise.all_failed',
  );
}

export function useDeleteWithUndo(onDeleted: () => void = (): void => undefined): Hidden {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const restore = (key: string): void => {
    setHidden((current) => new Set([...current].filter((entry) => entry !== key)));
  };
  return {
    hidden,
    remove: (key, removal, what): void => {
      setHidden((current) => new Set([...current, key]));
      log.info('delete.scheduled', {
        key,
        events: removal.eventIds.length,
        recordings: removal.recordingIds.length,
      });
      notify({
        message: `${what} deleted`,
        action: {
          label: 'Undo',
          onPress: () => {
            log.info('delete.undone', { key });
            restore(key);
          },
        },
        onDismissed: () => {
          commitDelete({ key, removal, what, restore, onDeleted });
        },
      });
    },
  };
}
