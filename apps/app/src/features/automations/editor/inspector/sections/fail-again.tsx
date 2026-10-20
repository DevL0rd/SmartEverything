import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../../../../components/section';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import { portOps } from './edits';
import type { FailAgainMode } from './catch-model';
import { failAgainChoice, failAgainPorts } from './catch-model';
import { flowNodeOf } from './node-view';
import type { SectionProps } from './section-types';

export function FailAgain({ view, env, actions }: SectionProps): ReactNode {
  const node = flowNodeOf(view);
  const choice = node === undefined ? null : failAgainChoice(node);
  if (node === undefined || choice === null) return null;
  return (
    <Section title="Fail again">
      <View className="gap-2 px-4">
        <Segmented<FailAgainMode>
          label="What the new failure says"
          options={[
            { value: 'same', label: 'Same cause' },
            { value: 'new', label: 'A new message' },
          ]}
          value={choice.mode}
          disabled={env.locked}
          onChange={(mode) => {
            const ports = failAgainPorts(choice.source, mode);
            actions.apply(portOps(view.key, 'message', ports.message ?? null));
          }}
        />
        <Text variant="footnote" tone="variant">
          {choice.mode === 'same'
            ? 'Raises the failure that was caught, with its message.'
            : 'Raises a new failure with your message and the caught failure as its cause.'}
        </Text>
      </View>
    </Section>
  );
}
