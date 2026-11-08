import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SwitchRow } from '../../../../../components/rows';
import { List } from '../../../../../components/section';
import type { GraphSectionProps } from './graph-connections-model';

const ON: { readonly lit: boolean } = { lit: true };

export const START_KIND = 'flow.start';

export const ADMIT_TITLE = 'Only start if';

export function hasAdmit(props: Pick<GraphSectionProps, 'program' | 'node'>): boolean {
  return props.node.kind === START_KIND && props.program.kind === 'automation';
}

export function GraphAdmit({
  program,
  node,
  locked,
  actions,
  renderValue,
}: GraphSectionProps): ReactNode {
  const admit = program.kind === 'automation' ? program.admit : undefined;
  return (
    <List title={ADMIT_TITLE}>
      <SwitchRow
        key="switch"
        title="Check before every run"
        subtitle="A start is dropped quietly when this is not true. The trigger values can be used."
        wrapSubtitle
        value={admit !== undefined}
        disabled={locked}
        onChange={(on) => {
          actions.apply([{ op: 'header', admit: on ? ON : null }]);
        }}
      />
      {admit === undefined ? null : (
        <View key="value" className="px-4 py-3">
          {renderValue({
            nodeKey: node.key,
            slot: 'admit',
            label: ADMIT_TITLE,
            helper: undefined,
            type: { t: 'boolean' },
            control: { t: 'switch' },
            isStatic: false,
            required: true,
            value: admit,
            message: undefined,
            onChange: (value) => {
              actions.apply([{ op: 'header', admit: value }]);
            },
          })}
        </View>
      )}
    </List>
  );
}
