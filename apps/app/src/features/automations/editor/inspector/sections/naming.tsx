import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CommittedField } from './committed-field';
import { labelOps, noteOps } from './edits';
import type { SectionProps } from './section-types';

export function Naming({ view, env, actions }: SectionProps): ReactNode {
  return (
    <View className="gap-3 px-4">
      <CommittedField
        label="Name on the card"
        value={view.node.label ?? ''}
        placeholder={view.kind?.name ?? 'Name'}
        disabled={env.locked}
        onCommit={(text) => {
          actions.apply(labelOps(view.key, text));
        }}
      />
      <CommittedField
        label="Note"
        helper="Shown in the card's tooltip."
        value={view.node.note ?? ''}
        multiline
        disabled={env.locked}
        onCommit={(text) => {
          actions.apply(noteOps(view.key, text));
        }}
      />
    </View>
  );
}
