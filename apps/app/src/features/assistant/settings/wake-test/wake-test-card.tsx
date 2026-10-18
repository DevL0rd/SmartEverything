import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Card } from '../../../../components/card';
import { Text } from '../../../../components/text';
import { useValue } from '../../../../design/external-store';
import { AliasChips } from './alias-chips';
import { useAliases } from './use-aliases';
import { useWakeTest } from './use-wake-test';
import { aliasFromHeard, aliasWordsOf } from './wake-alias';
import { wakeTestLines } from './wake-test-lines';
import { WakeTestRow } from './wake-test-row';

function Lines({ on }: { readonly on: boolean }): ReactNode {
  const lines = useValue(wakeTestLines);
  const { name, aliases, add } = useAliases();
  if (!on) return null;
  if (lines.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        {`Listening. Say “${name}” anywhere in a sentence near a camera, computer or phone that listens.`}
      </Text>
    );
  }
  return (
    <View accessibilityRole="list" accessibilityLiveRegion="polite">
      {lines.map((line) => (
        <WakeTestRow
          key={line.id}
          line={line}
          alias={aliasFromHeard(line.text ?? '', name, aliases)}
          words={aliasWordsOf(line.text ?? '', name, aliases)}
          onAdd={add}
        />
      ))}
    </View>
  );
}

export function WakeTestCard(): ReactNode {
  const { on, toggle } = useWakeTest();
  const { aliases, remove } = useAliases();
  return (
    <Card
      title="Test the wake word"
      icon="mic"
      action={
        <Button
          label={on ? 'Stop test' : 'Start test'}
          variant={on ? 'tonal' : 'filled'}
          icon={on ? 'close' : 'mic'}
          onPress={toggle}
        />
      }
    >
      <Text variant="footnote" tone="variant">
        While the test runs, every phrase the ears pick up is written down here, newest first. Add a
        mishearing as another name and it takes effect within about a second.
      </Text>
      <Lines on={on} />
      <AliasChips aliases={aliases} onRemove={remove} />
    </Card>
  );
}
