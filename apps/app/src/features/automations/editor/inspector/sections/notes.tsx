import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CommittedField } from './committed-field';
import { noteOps } from './edits';
import type { SectionProps } from './section-types';

export function Notes({ view, env, actions }: SectionProps): ReactNode {
  return (
    <View className="px-4">
      <CommittedField
        label="Note"
        helper="Shown on the card's tooltip."
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
