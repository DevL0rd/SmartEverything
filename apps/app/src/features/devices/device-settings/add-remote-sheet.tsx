import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { createIrRemote } from '../../../api/ir';
import type { Device } from '../../../store/state';
import { useMutationState } from '../../../store/mutation';
import { CATEGORY_LOOKS, REMOTE_CATEGORIES, type RemoteCategory } from '../remote/remote-category';

type Category = RemoteCategory;

const NAME_MOST = 80;

interface Draft {
  readonly name: string;
  readonly brand: string;
  readonly category: Category;
}

function CategoryList({
  value,
  onPick,
}: {
  readonly value: Category;
  readonly onPick: (category: Category) => void;
}): ReactNode {
  return (
    <List title="What is it?">
      {REMOTE_CATEGORIES.map((category) => (
        <ListRow
          key={category}
          title={CATEGORY_LOOKS[category].label}
          icon={CATEGORY_LOOKS[category].icon}
          selected={value === category}
          trailing={value === category ? <Icon name="check" size={20} tone="primary" /> : undefined}
          onPress={() => {
            onPick(category);
          }}
        />
      ))}
    </List>
  );
}

function Fields({
  draft,
  problem,
  onChange,
  onSubmit,
}: {
  readonly draft: Draft;
  readonly problem: string | null;
  readonly onChange: (draft: Draft) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <CategoryList
        value={draft.category}
        onPick={(category) => {
          onChange({ ...draft, category });
        }}
      />
      <TextField
        label="Name"
        placeholder="Remote name"
        value={draft.name}
        onChange={(name) => {
          onChange({ ...draft, name });
        }}
        error={problem}
        focusOnMount
      />
      <TextField
        label="Brand (optional)"
        placeholder="Brand"
        value={draft.brand}
        onChange={(brand) => {
          onChange({ ...draft, brand });
        }}
        onSubmit={onSubmit}
      />
    </View>
  );
}

export function AddRemoteSheet({
  blaster,
  onClose,
}: {
  readonly blaster: Device;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>({ name: '', brand: '', category: 'tv' });
  const mutation = useMutationState();
  const name = draft.name.trim();
  const ready = name !== '' && name.length <= NAME_MOST;
  const add = (): void => {
    if (!ready) {
      return;
    }
    const brand = draft.brand.trim();
    mutation.run(
      () =>
        createIrRemote({
          blasterId: blaster.id,
          name,
          category: CATEGORY_LOOKS[draft.category].stored,
          brand: brand === '' ? null : brand,
        }),
      { failure: 'The remote wasn’t added', inline: true, onDone: onClose },
    );
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a remote"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Add" loading={mutation.busy} disabled={!ready} onPress={add} />
        </>
      }
    >
      <Fields draft={draft} problem={mutation.problem} onChange={setDraft} onSubmit={add} />
    </Sheet>
  );
}
