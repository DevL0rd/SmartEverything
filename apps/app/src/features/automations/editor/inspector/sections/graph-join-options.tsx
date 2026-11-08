import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SelectRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import type { GraphSectionProps } from './graph-connections-model';
import { STATUS_NOTE, joinOptionOps, joinOptionsOf } from './graph-paths-model';

export function GraphJoinOptions(section: GraphSectionProps): ReactNode {
  const { program, node, kinds, locked, actions } = section;
  const options = joinOptionsOf(program, node, kinds);
  if (options === undefined) return null;
  return (
    <Section title={options.title} caption={`for ${options.forkName}`}>
      <List>
        <SelectRow
          title="Finishes when"
          value={options.join ?? null}
          placeholder="Set by a wire"
          disabled={locked || options.join === undefined}
          options={options.joinChoices}
          onChange={(id) => {
            actions.apply(joinOptionOps(options.forkKey, 'join', id));
          }}
        />
      </List>
      <View className="gap-3 px-4 py-3">
        {options.errors === undefined ? (
          <Text variant="footnote" tone="variant">
            What a failing path does is set by a wire.
          </Text>
        ) : (
          <Segmented
            label="If one path fails"
            options={options.errorChoices}
            value={options.errors}
            disabled={locked}
            onChange={(id) => {
              actions.apply(joinOptionOps(options.forkKey, 'errors', id));
            }}
          />
        )}
        {options.recordsEach ? (
          <Text variant="footnote" tone="variant">
            {STATUS_NOTE}
          </Text>
        ) : null}
      </View>
    </Section>
  );
}
