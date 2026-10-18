import type { ReactNode } from 'react';
import { DEFAULT_ENGINE, type Engine } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { useIsOwner } from '../../../store/selectors';
import { useModelLabel, modelOrNull } from '../picker/model-label';
import { ModelLibrary, useLibraryDisclosure } from '../picker/model-library';
import { useSuggestedModels } from '../picker/model-queries';
import { useEngineCatalogue, useEngineDefaultChange } from '../provider/provider-data';

const OWNER_ONLY = 'Only the owner can change the default.';

function useDefaultEngine(): { readonly engine: Engine; readonly save: (engine: Engine) => void } {
  const catalogue = useEngineCatalogue();
  const legacy = useSuggestedModels('chat', null, true);
  const change = useEngineDefaultChange();
  const resolved = legacy.data?.default;
  const legacyEngine: Engine =
    resolved === undefined || resolved === null
      ? DEFAULT_ENGINE
      : { kind: 'openrouter', model: modelOrNull(resolved.choice), effort: resolved.effort };
  return {
    engine: catalogue.data?.default ?? legacyEngine,
    save: (engine): void => {
      change.mutate(engine);
    },
  };
}

export function DefaultModelRow(): ReactNode {
  const library = useLibraryDisclosure();
  const owner = useIsOwner();
  const current = useDefaultEngine();
  const label = useModelLabel(current.engine);
  return (
    <>
      <ListRow
        title="Default for new chats"
        subtitle={`${label.name}${label.computer === null ? '' : ` · ${label.computer}`}`}
        icon="star"
        chevron
        onPress={() => {
          library.open();
        }}
      />
      <ModelLibrary
        open={library.query !== null}
        onClose={library.close}
        mode="default"
        engine={current.engine}
        onChange={owner ? current.save : null}
        note={owner ? null : OWNER_ONLY}
      />
    </>
  );
}
