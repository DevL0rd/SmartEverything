import { useState } from 'react';
import { notify } from '../../../components/toast-store';
import { ListEdits } from '../model/list-edits';

import { Logger } from '@smarteverything/logging';

const log = new Logger('app.plugins');
export interface ListEdit {
  readonly items: readonly string[];
  readonly edit: (change: (items: readonly string[]) => readonly string[]) => void;
}

export function useListEdit(
  server: readonly string[],
  save: (items: readonly string[]) => Promise<void>,
  failure: string,
): ListEdit {
  const [edits] = useState(() => new ListEdits());
  const [draft, setDraft] = useState<readonly string[] | null>(null);
  const [seen, setSeen] = useState(server.join('\n'));
  const serverKey = server.join('\n');
  if (seen !== serverKey) {
    setSeen(serverKey);
    if (edits.catchUp()) {
      setDraft(null);
    }
  }
  const edit = (change: (items: readonly string[]) => readonly string[]): void => {
    const next = edits.begin(server, change);
    setDraft(next);
    const operation = log.operation('plugin_list.edit', { items: next.length, failure });
    save(next).then(
      () => {
        operation.succeeded();
        edits.land();
      },
      (error: unknown) => {
        operation.failed(error);
        edits.fail();
        setDraft(null);
        notify({ message: failure, error, tone: 'critical' });
      },
    );
  };
  return { items: draft ?? server, edit };
}
