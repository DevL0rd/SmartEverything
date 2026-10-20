import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SwitchRow } from '../../../../components/rows';
import { List } from '../../../../components/section';
import type { HeaderSectionProps } from './header-types';

const ON: { readonly lit: boolean } = { lit: true };

export function AdmitSection({ env }: HeaderSectionProps): ReactNode {
  const { admit } = env.program;
  return (
    <List title="Only run if">
      <SwitchRow
        key="switch"
        title="Check before every run"
        subtitle="A start is dropped quietly when this is not true. The trigger values can be used."
        wrapSubtitle
        value={admit !== undefined}
        disabled={env.locked}
        onChange={(on) => {
          env.apply([{ op: 'header', admit: on ? ON : null }]);
        }}
      />
      {admit === undefined ? null : (
        <View key="value" className="px-4 py-3">
          {env.renderValue({
            nodeKey: env.anchorKey,
            slot: 'admit',
            label: 'Only run if',
            helper: undefined,
            type: { t: 'boolean' },
            control: { t: 'switch' },
            isStatic: false,
            required: true,
            value: admit,
            message: undefined,
            onChange: (value) => {
              env.apply([{ op: 'header', admit: value }]);
            },
          })}
        </View>
      )}
    </List>
  );
}
