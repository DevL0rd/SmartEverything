import type { PlannerSleepSound } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { MusicTab } from '../alarm/sound-music';
import { RadioTab } from '../alarm/sound-radio';
import { NoiseSpectrum } from './noise-spectrum';
import {
  NOISES,
  NOISE_HINTS,
  NOISE_LABELS,
  sleepSoundKindOf,
  type SleepSoundKind,
} from './sleep-sound-model';

export interface SleepSoundPickerProps {
  readonly open: boolean;
  readonly sound: PlannerSleepSound | null;
  readonly onPick: (sound: PlannerSleepSound) => void;
  readonly onClose: () => void;
}

const KINDS = [
  { value: 'noise', label: 'Noise', icon: 'audioLines' },
  { value: 'drive', label: 'Drive', icon: 'music' },
  { value: 'radio', label: 'Radio', icon: 'radio' },
] as const;

function NoiseChoices({
  sound,
  onPick,
}: Pick<SleepSoundPickerProps, 'sound' | 'onPick'>): ReactNode {
  return (
    <List>
      {NOISES.map((colour) => {
        const on = sound?.kind === 'noise' && sound.colour === colour;
        return (
          <ListRow
            key={colour}
            title={NOISE_LABELS[colour]}
            subtitle={NOISE_HINTS[colour]}
            leading={<NoiseSpectrum colour={colour} width={56} height={28} />}
            selected={on}
            trailing={on ? <Icon name="check" size={18} tone="primary" /> : null}
            onPress={() => {
              onPick({ kind: 'noise', colour });
            }}
          />
        );
      })}
    </List>
  );
}

export function SleepSoundPicker(props: SleepSoundPickerProps): ReactNode {
  const [kind, setKind] = useState<SleepSoundKind>(sleepSoundKindOf(props.sound));
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Sleep sound"
      detents={['full']}
      footer={
        <View className="flex-row justify-end">
          <Button label="Done" icon="check" onPress={props.onClose} />
        </View>
      }
    >
      <View className="gap-4 pb-4 pt-2">
        <Segmented options={KINDS} value={kind} onChange={setKind} label="Kind of sound" fill />
        {kind === 'noise' ? <NoiseChoices sound={props.sound} onPick={props.onPick} /> : null}
        {kind === 'drive' ? (
          <MusicTab sound={props.sound} use="sleep" onPick={props.onPick} />
        ) : null}
        {kind === 'radio' ? (
          <RadioTab sound={props.sound} use="sleep" onPick={props.onPick} />
        ) : null}
      </View>
    </Sheet>
  );
}
