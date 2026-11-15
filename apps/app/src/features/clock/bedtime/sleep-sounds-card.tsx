import type { PlannerSleepSound, PlannerSleepSounds } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { clock24 } from '../../../format/time';
import type { SleepSoundState } from '../../../../modules/health-connect';
import { NoiseSpectrum } from './noise-spectrum';
import { OFF } from './schedule-model';
import { SleepSoundPicker } from './sleep-sound-picker';
import {
  fadeOptionsOf,
  sleepSoundKindLabelOf,
  sleepSoundTitleOf,
  timerOptionsOf,
} from './sleep-sound-model';
import type { SleepSoundControl } from './bedtime-data';

export interface SleepSoundsProps {
  readonly sounds: PlannerSleepSounds;
  readonly itemName: string | null;
  readonly live: SleepSoundState | null;
  readonly control: SleepSoundControl;
  readonly compact: boolean;
  readonly offline: boolean;
  readonly onSave: (edit: (sounds: PlannerSleepSounds) => PlannerSleepSounds) => void;
}

function SoundArt({ sound }: { readonly sound: PlannerSleepSound | null }): ReactNode {
  if (sound?.kind === 'noise') {
    return <NoiseSpectrum colour={sound.colour} width={72} height={40} />;
  }
  return (
    <View className="h-10 w-18 items-center justify-center rounded-md bg-surface-3">
      <Icon name={sound?.kind === 'radio' ? 'radio' : 'music'} size={24} colour="sleep-core" />
    </View>
  );
}

function SoundTile({
  card,
  onOpen,
}: {
  readonly card: SleepSoundsProps;
  readonly onOpen: () => void;
}): ReactNode {
  const { sound } = card.sounds;
  const title = sleepSoundTitleOf(sound, card.itemName);
  return (
    <Interactive
      label={`Sleep sound, ${title}. Change`}
      disabled={card.offline}
      onPress={onOpen}
      className="min-h-touch-min flex-row items-center gap-4 rounded-md bg-surface-2 p-3"
      layerClassName="rounded-md"
    >
      <SoundArt sound={sound} />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="variant">
          {sleepSoundKindLabelOf(sound)}
        </Text>
      </View>
      <Text variant="callout" tone="primary">
        Change
      </Text>
    </Interactive>
  );
}

function liveLineOf(live: SleepSoundState | null, here: boolean): string {
  if (live?.playing === true) {
    const until = live.endsAt === null ? 'until you stop it' : `until ${clock24(live.endsAt)}`;
    return `Playing ${live.title ?? 'now'} ${until}`;
  }
  return here ? 'Plays on this phone' : 'Plays on your phone';
}

function PlayRow({ card }: { readonly card: SleepSoundsProps }): ReactNode {
  const [busy, setBusy] = useState<'play' | 'stop' | null>(null);
  const playing = card.live?.playing === true;
  const run = (action: 'play' | 'stop'): void => {
    setBusy(action);
    const done = action === 'play' ? card.control.play(card.sounds) : card.control.stop();
    done
      .catch(
        notifyFailure(
          action === 'play' ? 'The sleep sound did not start' : 'The sleep sound did not stop',
        ),
      )
      .finally(() => {
        setBusy(null);
      });
  };
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <View className={cn('size-2 rounded-full', playing ? 'bg-positive' : 'bg-outline')} />
        <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
          {liveLineOf(card.live, card.control.here)}
        </Text>
      </View>
      {playing ? null : (
        <Button
          label="Play now"
          icon="play"
          loading={busy === 'play'}
          disabled={card.offline || card.sounds.sound === null}
          onPress={() => {
            run('play');
          }}
        />
      )}
      {card.control.here && !playing ? null : (
        <Button
          label="Stop"
          icon="square"
          variant={playing ? 'filled' : 'outlined'}
          loading={busy === 'stop'}
          disabled={card.offline}
          onPress={() => {
            run('stop');
          }}
        />
      )}
    </View>
  );
}

function TimerRows({ card }: { readonly card: SleepSoundsProps }): ReactNode {
  const { sounds, compact, offline, onSave } = card;
  return (
    <List>
      <SelectRow
        title="Sleep timer"
        icon="timer"
        compact={compact}
        options={timerOptionsOf(sounds.timer_minutes)}
        value={sounds.timer_minutes === null ? OFF : String(sounds.timer_minutes)}
        disabled={offline}
        onChange={(value) => {
          onSave((current) => ({
            ...current,
            timer_minutes: value === OFF ? null : Number(value),
          }));
        }}
      />
      <SelectRow
        title="Fade out"
        icon="volume"
        compact={compact}
        options={fadeOptionsOf(sounds.fade_seconds)}
        value={String(sounds.fade_seconds)}
        disabled={offline}
        onChange={(value) => {
          onSave((current) => ({ ...current, fade_seconds: Number(value) }));
        }}
      />
    </List>
  );
}

export function SleepSoundsCard(card: SleepSoundsProps): ReactNode {
  const [picking, setPicking] = useState(false);
  const { sounds, onSave } = card;
  return (
    <Card title="Sleep sounds" icon="audioLines">
      <SoundTile
        card={card}
        onOpen={() => {
          setPicking(true);
        }}
      />
      <TimerRows card={card} />
      <PlayRow card={card} />
      <SleepSoundPicker
        open={picking}
        sound={sounds.sound}
        onPick={(sound) => {
          onSave((current) => ({ ...current, sound }));
        }}
        onClose={() => {
          setPicking(false);
        }}
      />
    </Card>
  );
}
