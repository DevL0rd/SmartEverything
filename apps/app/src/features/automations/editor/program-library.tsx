import { useState, type ReactNode } from 'react';
import type {
  AutomationValueContent,
  AutomationValueRow,
  AutomationSequenceRow,
} from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { Sheet } from '../../../components/sheet';
import { ValueEditor } from './value-editor';
import { SequenceEditor } from './sequence-editor';
import { LibraryContext } from './program-library-context';
import { LibraryReturnContext } from './library-return';

interface ValueRequest {
  readonly kind: 'value';
  readonly row: AutomationValueRow | null;
  readonly initialKind: AutomationValueContent['kind'];
  readonly select: (row: AutomationValueRow) => void;
  readonly lockKind: boolean;
}
interface SequenceRequest {
  readonly kind: 'sequence';
  readonly row: AutomationSequenceRow | null;
  readonly select: (row: AutomationSequenceRow) => void;
}
type LibraryRequest = ValueRequest | SequenceRequest;
interface LibrarySheetProps {
  readonly request: LibraryRequest;
  readonly close: () => void;
}
function LibraryContent({ request }: { readonly request: LibraryRequest }): ReactNode {
  return request.kind === 'value' ? (
    <ValueEditor row={request.row} initialKind={request.initialKind} lockKind={request.lockKind} />
  ) : (
    <ProgramLibraryProvider>
      <SequenceEditor start={request.row} />
    </ProgramLibraryProvider>
  );
}
function LibrarySheet({ request, close }: LibrarySheetProps): ReactNode {
  const [dirty, setDirty] = useState(false);
  const cancel = (): void => {
    if (!dirty) {
      close();
      return;
    }
    void confirm({
      title: 'Discard library changes?',
      body: 'Your caller draft is kept.',
      confirmLabel: 'Discard',
      tone: 'destructive',
    }).then((accepted) => {
      if (accepted) close();
    });
  };
  return (
    <LibraryReturnContext
      value={{
        close,
        setDirty,
        valueSaved: (row): void => {
          if (request.kind === 'value') {
            request.select(row);
            close();
          }
        },
        sequenceSaved: (row): void => {
          if (request.kind === 'sequence') {
            request.select(row);
            close();
          }
        },
      }}
    >
      <Sheet
        open
        title={request.kind === 'value' ? 'Value' : 'Sequence'}
        onClose={cancel}
        detents={['full']}
      >
        <LibraryContent request={request} />
      </Sheet>
    </LibraryReturnContext>
  );
}
export function ProgramLibraryProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [request, setRequest] = useState<LibraryRequest | null>(null);
  return (
    <LibraryContext
      value={{
        value: (row, initialKind, select, lockKind = false): void => {
          setRequest({ kind: 'value', row, initialKind, select, lockKind });
        },
        sequence: (row, select): void => {
          setRequest({ kind: 'sequence', row, select });
        },
      }}
    >
      {children}
      {request === null ? null : (
        <LibrarySheet
          key={`${request.kind}:${request.row?.id ?? 'new'}`}
          request={request}
          close={() => {
            setRequest(null);
          }}
        />
      )}
    </LibraryContext>
  );
}
