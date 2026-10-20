import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Disclosure } from '../../../../../components/disclosure';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import { CommittedField } from './committed-field';
import { enabledOps, renameOps, renameProblem } from './edits';
import type { SectionProps } from './section-types';

export function Advanced({ view, env, actions }: SectionProps): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1 px-4">
      <Disclosure
        label="Advanced"
        hint="Key, step on or off and free position"
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
      >
        <View className="gap-3 pb-2">
          <CommittedField
            label="Key"
            kind="code"
            helper="Wires and the AI use this name. Renaming updates every wire that reads it."
            value={view.key}
            disabled={env.locked}
            validate={(text) => renameProblem(env.program, view.key, text.trim())}
            onCommit={(text) => {
              actions.apply(renameOps(view.key, text.trim()));
            }}
          />
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
              title="Free position"
              subtitle="Keep this card where you drop it instead of the automatic layout."
              value={env.freePosition}
              disabled={env.locked}
              onChange={(free) => {
                actions.setFreePosition(view.id, free);
              }}
            />
          </List>
        </View>
      </Disclosure>
    </View>
  );
}
