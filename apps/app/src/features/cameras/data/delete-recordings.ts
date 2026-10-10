import { useState } from 'react';
import { deleteRecording, removeEvent } from '../../../api/media';
import { notify } from '../../../components/toast-store';
import type { Removal } from '../logic/event-entries';

export interface Hidden {
  readonly hidden: ReadonlySet<string>;
  readonly remove: (key: string, removal: Removal, what: string) => void;
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
      notify({
        message: `${what} deleted`,
        action: {
          label: 'Undo',
          onPress: () => {
            restore(key);
          },
        },
        onDismissed: () => {
          void Promise.all([
            ...removal.eventIds.map(removeEvent),
            ...removal.recordingIds.map(deleteRecording),
          ]).then(onDeleted, (error: unknown) => {
            restore(key);
            notify({
              message: `${what} wasn’t deleted`,
              error,
              tone: 'critical',
            });
          });
        },
      });
    },
  };
}
