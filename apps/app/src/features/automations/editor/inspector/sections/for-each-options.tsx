import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { SwitchRow } from '../../../../../components/rows';
import { List, Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { portOps } from './edits';
import { DEFAULT_TOGETHER_WIDTH, concurrencyOps, forEachView } from './loop-model';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

const TOGETHER_CAPTION = 'Passes can finish in any order. Collected results keep the list order.';

function Together({ section }: { readonly section: SectionProps }): ReactNode {
  const { view, env, actions } = section;
  const node = flowNodeOf(view);
  if (node === undefined || view.kind === undefined) return null;
  const options = forEachView(node, view.kind);
  return (
    <List title="At the same time" footer={TOGETHER_CAPTION}>
      <SwitchRow
        title="Run passes together"
        value={options.together}
        disabled={env.locked}
        onChange={(on) => {
          actions.apply(concurrencyOps(view.key, on ? DEFAULT_TOGETHER_WIDTH : 1));
        }}
      />
      {options.together ? (
        <View className="px-4 py-2">
          <NumberStepper
            label="Up to"
            value={options.width}
            min={2}
            max={options.most}
            step={1}
            disabled={env.locked}
            onChange={(width) => {
              actions.apply(concurrencyOps(view.key, width));
            }}
          />
        </View>
      ) : null}
    </List>
  );
}

function Collect({ section }: { readonly section: SectionProps }): ReactNode {
  const { view, env, actions } = section;
  const node = flowNodeOf(view);
  if (node === undefined || view.kind === undefined) return null;
  const options = forEachView(node, view.kind);
  return (
    <Section title="Collect a value from each pass">
      <List>
        <SwitchRow
          title="Collect a value"
          subtitle="Adds the output Results, a list of the collected values."
          value={options.collecting}
          disabled={env.locked}
          onChange={(on) => {
            actions.apply(
              portOps(view.key, 'collect', on ? { wire: { from: view.key, port: 'item' } } : null),
            );
          }}
        />
      </List>
      {options.collecting ? (
        <View className="gap-1 px-4 pt-2">
          <Text variant="footnote" tone="variant">
            Value to collect
          </Text>
          {env.renderValue({
            nodeKey: view.key,
            slot: 'collect',
            label: 'Value to collect',
            helper: 'Choose from the loop item and the steps inside this loop.',
            type: undefined,
            control: { t: 'json' },
            isStatic: false,
            required: false,
            value: node.ports?.['collect'],
            message: env.findings.find((found) => found.port === 'collect')?.message,
            onChange: (value) => {
              actions.apply(portOps(view.key, 'collect', value));
            },
          })}
        </View>
      ) : null}
    </Section>
  );
}

export function ForEachOptions(section: SectionProps): ReactNode {
  return (
    <>
      <Together section={section} />
      <Collect section={section} />
    </>
  );
}
