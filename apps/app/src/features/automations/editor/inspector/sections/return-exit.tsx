import type { ReactNode } from 'react';
import { View } from 'react-native';
import { outputLabel } from '@smarteverything/domain';
import { Section, SectionAction } from '../../../../../components/section';
import { portOps } from './edits';
import { exitOps, returnExit } from './loop-model';
import { flowNodeOf } from './node-view';
import { RadioRows } from './radio-rows';
import type { SectionProps } from './section-types';

export function ReturnExit({ view, env, actions }: SectionProps): ReactNode {
  const node = flowNodeOf(view);
  if (node === undefined) return null;
  const exit = returnExit(node) ?? env.exits[0] ?? '';
  return (
    <View className="gap-3">
      {env.exits.length === 0 ? null : (
        <RadioRows
          title="Leave through"
          value={exit}
          disabled={env.locked}
          options={env.exits.map((name) => ({ value: name, title: outputLabel(name) }))}
          onChange={(name) => {
            actions.apply(exitOps(view.key, name));
          }}
        />
      )}
      <Section
        title="Gives back"
        action={<SectionAction label="Edit interface" onPress={actions.editInterface} />}
      >
        <View className="gap-3 px-4">
          {env.program.outputs.map((output) =>
            env.renderValue({
              nodeKey: view.key,
              slot: output.name,
              label: output.label ?? outputLabel(output.name),
              helper: output.description,
              type: output.type,
              control: undefined,
              isStatic: false,
              required: output.optional !== true,
              value: node.ports?.[output.name],
              message: env.findings.find((found) => found.port === output.name)?.message,
              onChange: (value) => {
                actions.apply(portOps(view.key, output.name, value));
              },
            }),
          )}
        </View>
      </Section>
    </View>
  );
}
