import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { selectionTick } from '../../../../platform/haptics';
import { useCallAudioDevices } from '../audio-devices';
import { ECHO_CHOICES, type EchoChoice } from '../model/listening-choices';
import { useCallAudio } from './call-audio-pref';

function ChoiceRow({
  choice,
  selected,
  onPick,
}: {
  readonly choice: EchoChoice;
  readonly selected: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={`${choice.title}. ${choice.hint}`}
      selected={selected}
      onPress={() => {
        selectionTick();
        onPick();
      }}
      className={cn(
        'min-h-touch-min flex-row items-start gap-3 rounded-md px-3 py-2.5',
        selected && 'bg-primary-container',
      )}
      layerClassName="rounded-md"
    >
      <View
        className={cn(
          'mt-0.5 size-5 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-outline',
        )}
      >
        {selected ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-strong">{choice.title}</Text>
        <Text variant="footnote" tone="variant">
          {choice.hint}
        </Text>
      </View>
    </Interactive>
  );
}

function HeadsetSuggestion({
  headset,
  onUse,
}: {
  readonly headset: string;
  readonly onUse: () => void;
}): ReactNode {
  return (
    <View className="mt-1 flex-row items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
      <Icon name="headphones" size={20} tone="variant" />
      <Text variant="footnote" className="min-w-0 flex-1">
        {`${headset} connected · Use Headphones mode`}
      </Text>
      <Button label="Use" variant="tonal" onPress={onUse} />
    </View>
  );
}

export function EchoChoiceRows(): ReactNode {
  const { pref, change } = useCallAudio();
  const { headset } = useCallAudioDevices();
  const suggest = headset !== null && (pref.echo === 'normal' || pref.echo === 'strong');
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Echo handling" className="gap-1 p-2">
      {ECHO_CHOICES.map((choice) => (
        <ChoiceRow
          key={choice.value}
          choice={choice}
          selected={choice.value === pref.echo}
          onPick={() => {
            change({ echo: choice.value }, `Echo handling · ${choice.title}`);
          }}
        />
      ))}
      {suggest ? (
        <HeadsetSuggestion
          headset={headset}
          onUse={() => {
            change({ echo: 'headphones' }, 'Echo handling · Headphones');
          }}
        />
      ) : null}
    </View>
  );
}
