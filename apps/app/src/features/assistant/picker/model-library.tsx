import type { ReactNode } from 'react';
import type { Engine } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { ModelPickerProps } from '../data/model-candidates';
import type { NativeModelRequest } from '../provider/subscription-models';
import { LibraryBody } from './library/library-body';
import { librarySubtitle, libraryTitle } from './library/library-model';
import { engineOf, pickOf } from './library/library-pick';
import { LibrarySheet } from './library/library-sheet';
import { useModelsRefresh, type ModelsRefresh } from './library/library-refresh';

export { useLibraryDisclosure } from './library/library-disclosure';

interface Picking {
  readonly mode: 'pick' | 'default';
  readonly engine: Engine;
  readonly onChange: ((engine: Engine) => void) | null;
  readonly note?: string | null;
  readonly initialQuery?: string;
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
}

interface Browsing {
  readonly mode: 'browse';
}

export type ModelLibraryProps = (Picking | Browsing) & {
  readonly open: boolean;
  readonly onClose: () => void;
};

function pickerOf(props: Picking | Browsing, close: () => void): ModelPickerProps {
  if (props.mode === 'browse') return { picked: null, onPick: null };
  const { onChange, onNativeNeeded } = props;
  return {
    picked: pickOf(props.engine),
    ...(props.initialQuery === undefined ? {} : { initialQuery: props.initialQuery }),
    onPick:
      onChange === null
        ? null
        : (pick): void => {
            onChange(engineOf(pick));
            close();
          },
    onNativeNeeded:
      onNativeNeeded === undefined
        ? undefined
        : (request): void => {
            onNativeNeeded(request);
            close();
          },
  };
}

function noteOf(props: Picking | Browsing): string | null {
  return props.mode === 'browse' ? null : (props.note ?? null);
}

function RefreshButton({ refresh }: { readonly refresh: ModelsRefresh | null }): ReactNode {
  return refresh === null ? null : (
    <Button
      label="Refresh"
      variant="outlined"
      icon={refresh.busy ? 'loader' : 'refresh'}
      loading={refresh.busy}
      onPress={refresh.run}
    />
  );
}

export function ModelLibrary(props: ModelLibraryProps): ReactNode {
  const refresh = useModelsRefresh();
  return (
    <LibrarySheet
      open={props.open}
      onClose={props.onClose}
      title={libraryTitle(props.mode)}
      subtitle={librarySubtitle(props.mode)}
      action={
        props.mode === 'browse' && refresh !== null ? <RefreshButton refresh={refresh} /> : null
      }
    >
      {(width): ReactNode => (
        <LibraryBody
          mode={props.mode}
          width={width}
          picker={pickerOf(props, props.onClose)}
          note={noteOf(props)}
        />
      )}
    </LibrarySheet>
  );
}
