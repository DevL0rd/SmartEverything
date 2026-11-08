import type { ReactNode } from 'react';
import type { Engine } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { useModelLabel } from '../picker/model-label';
import { ModelLibrary, useLibraryDisclosure } from '../picker/model-library';
import { useEngineCatalogue } from '../provider/provider-data';
import { writeAssistant } from './assistant-write';

const TITLE = 'Memory manager model';
const SUBTITLE = 'Used after each AI turn to keep the memories tidy.';

export function memoryModelEngine(base: Engine, model: string): Engine {
  return { ...base, model };
}

function useMemoryModelWrite(): (model: string) => void {
  const store = useEntityStore();
  return (model) => {
    background(
      writeAssistant({ memory_model: model }, { state: store.get(), store }).catch(
        (error: unknown) => {
          notify({ message: 'The memory manager model was not changed', error, tone: 'critical' });
        },
      ),
      'settings.memory_model_failed',
    );
  };
}

function LoadedMemoryModelRow({
  base,
  choice,
}: {
  readonly base: Engine;
  readonly choice: string;
}): ReactNode {
  const library = useLibraryDisclosure();
  const engine = memoryModelEngine(base, choice);
  const label = useModelLabel(engine);
  const write = useMemoryModelWrite();
  return (
    <>
      <ListRow
        title={TITLE}
        subtitle={SUBTITLE}
        wrapSubtitle
        icon="sparkles"
        value={label.name}
        chevron
        onPress={() => {
          library.open();
        }}
      />
      <ModelLibrary
        open={library.query !== null}
        onClose={library.close}
        mode="pick"
        engine={engine}
        onChange={(next) => {
          write(next.model);
        }}
      />
    </>
  );
}

export function MemoryModelRow(): ReactNode {
  const catalogue = useEngineCatalogue();
  const choice = useStoreSelector((state) => state.assistant?.settings.memory_model ?? null);
  if (catalogue.data === undefined || choice === null)
    return <ListRow title={TITLE} subtitle={SUBTITLE} wrapSubtitle icon="sparkles" />;
  return <LoadedMemoryModelRow base={catalogue.data.default} choice={choice} />;
}
