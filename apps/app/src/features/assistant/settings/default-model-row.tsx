import type { ReactNode } from 'react';
import type { Engine } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { useIsOwner } from '../../../store/selectors';
import { useModelLabel } from '../picker/model-label';
import { ModelLibrary, useLibraryDisclosure } from '../picker/model-library';
import { useEngineCatalogue, useEngineDefaultChange } from '../provider/provider-data';

const OWNER_ONLY = 'Only the owner can change the model for new chats.';
const LOADING = 'Loading model…';

function LoadedDefaultRow({ engine }: { readonly engine: Engine }): ReactNode {
  const library = useLibraryDisclosure();
  const owner = useIsOwner();
  const change = useEngineDefaultChange();
  const label = useModelLabel(engine);
  const name = label.computer === null ? label.name : `${label.name} · ${label.computer}`;
  const subtitle = engine.kind === 'dsh' ? name : 'Choose a model for new chats';
  return (
    <>
      <ListRow
        title="Model for new chats"
        subtitle={subtitle}
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
        engine={engine}
        onChange={
          owner
            ? (next): void => {
                change.mutate(next);
              }
            : null
        }
        note={owner ? null : OWNER_ONLY}
      />
    </>
  );
}

export function DefaultModelRow(): ReactNode {
  const catalogue = useEngineCatalogue();
  if (catalogue.data === undefined)
    return <ListRow title="Model for new chats" subtitle={LOADING} icon="star" />;
  return <LoadedDefaultRow engine={catalogue.data.default} />;
}
