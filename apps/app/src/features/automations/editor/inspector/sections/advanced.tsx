import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import { CommittedField } from './committed-field';
import { enabledOps, renameOps, renameProblem } from './edits';
import type { SectionProps } from './section-types';

export function Advanced({ view, env, actions }: SectionProps): ReactNode {
  return (
    <View className="gap-3">
      <View className="px-4">
        <CommittedField
          label="Short name for wires"
          kind="code"
          helper="Wires and the assistant use this name. Renaming updates every wire that reads it."
          value={view.key}
          disabled={env.locked}
          validate={(text) => renameProblem(env.program, view.key, text.trim())}
          onCommit={(text) => {
            actions.apply(renameOps(view.key, text.trim()));
          }}
        />
      </View>
      <List>
        <SwitchRow
          title="Step is on"
          subtitle="Turn off to skip it without deleting it."
          value={view.node.enabled !== false}
          disabled={env.locked}
          onChange={(on) => {
            actions.apply(enabledOps(view.key, on));
          }}
        />
        <SwitchRow
          title="Keep where I drop it"
          subtitle="Keep this card where you drop it instead of the automatic layout."
          value={env.freePosition}
          disabled={env.locked}
          onChange={(free) => {
            actions.setFreePosition(view.id, free);
          }}
        />
      </List>
    </View>
  );
}
