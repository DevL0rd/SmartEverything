import { useState, type ReactNode } from 'react';
import type {
  AutomationRow,
  AutomationValueContent,
  AutomationValueRow,
} from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { Sheet } from '../../../components/sheet';
import { ValueEditor } from './value-editor';
import { ReusableEditor } from './reusable-editor';
import { LibraryContext } from './program-library-context';
import { LibraryReturnContext } from './library-return';
import { background } from '@smarteverything/logging';

interface ValueRequest {
  readonly kind: 'value';
  readonly row: AutomationValueRow | null;
  readonly initialKind: AutomationValueContent['kind'];
  readonly select: (row: AutomationValueRow) => void;
  readonly lockKind: boolean;
}
interface ReusableRequest {
  readonly kind: 'reusable';
  readonly row: AutomationRow | null;
  readonly select: (row: AutomationRow) => void;
}
type LibraryRequest = ValueRequest | ReusableRequest;
interface LibrarySheetProps {
  readonly request: LibraryRequest;
  readonly close: () => void;
}
function LibraryContent({ request }: { readonly request: LibraryRequest }): ReactNode {
  return request.kind === 'value' ? (
    <ValueEditor row={request.row} initialKind={request.initialKind} lockKind={request.lockKind} />
  ) : (
    <ProgramLibraryProvider>
      <ReusableEditor row={request.row} />
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
    background(
      confirm({
        title: 'Discard library changes?',
        body: 'Your caller draft is kept.',
        confirmLabel: 'Discard',
        tone: 'destructive',
      }).then((accepted) => {
        if (accepted) close();
      }),
      'program_library.confirm_failed',
    );
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
        reusableSaved: (row): void => {
          if (request.kind === 'reusable') {
            request.select(row);
            close();
          }
        },
      }}
    >
      <Sheet
        open
        title={request.kind === 'value' ? 'Value' : 'Reusable steps'}
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
        reusable: (row, select): void => {
          setRequest({ kind: 'reusable', row, select });
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
