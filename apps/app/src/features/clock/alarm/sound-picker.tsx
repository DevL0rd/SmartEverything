import type { PlannerAlarmSound } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useDriveAlbums, useDriveItem } from '../../drive';
import { MusicTab } from './sound-music';
import { RadioTab } from './sound-radio';
import {
  SOUND_TABS,
  TONES,
  isChosen,
  musicItemIdOf,
  soundIconOf,
  soundKindTextOf,
  soundTabOf,
  soundTextOf,
  toneSound,
  type SoundTab,
  type SoundUse,
} from './sound-model';

export interface SoundPickerProps {
  readonly sound: PlannerAlarmSound;
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly title?: string;
  readonly sheetTitle?: string;
  readonly onChange: (sound: PlannerAlarmSound) => void;
}

interface AlarmTabProps {
  readonly sound: PlannerAlarmSound;
  readonly use: SoundUse;
  readonly onPick: (sound: PlannerAlarmSound) => void;
}

export function useSoundText(sound: PlannerAlarmSound): string {
  const itemId = musicItemIdOf(sound);
  const album = useDriveAlbums('drive').find((row) => row.id === itemId);
  const item = useDriveItem(album === undefined ? itemId : null, null);
  return soundTextOf(sound, album?.title ?? item.data?.name ?? null);
}

function TonesTab({ sound, onPick }: AlarmTabProps): ReactNode {
  return (
    <List>
      {TONES.map((tone) => {
        const candidate = toneSound(tone.id);
        return (
          <ListRow
            key={tone.id}
            title={tone.label}
            subtitle="The alarm sound set on each device"
            icon="bell"
            selected={isChosen(sound, candidate)}
            onPress={() => {
              onPick(candidate);
            }}
          />
        );
      })}
    </List>
  );
}

function Current({ sound }: { readonly sound: PlannerAlarmSound }): ReactNode {
  const text = useSoundText(sound);
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-primary/10 p-3">
      <Icon name={soundIconOf(sound)} size={20} tone="primary" />
      <View className="min-w-0 flex-1">
        <Text variant="caption" tone="variant">
          {`Set now · ${soundKindTextOf(sound)}`}
        </Text>
        <Text variant="body-strong" numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const TAB_BODY: Readonly<Record<SoundTab, (props: AlarmTabProps) => ReactNode>> = {
  tones: TonesTab,
  music: MusicTab,
  radio: RadioTab,
};

function SoundSheet({
  open,
  sound,
  title,
  onClose,
  onPick,
}: Omit<AlarmTabProps, 'use'> & {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
}): ReactNode {
  const [tab, setTab] = useState<SoundTab>(soundTabOf(sound));
  const Body = TAB_BODY[tab];
  return (
    <Sheet open={open} onClose={onClose} title={title} detents={['full']} subpage>
      <View className="gap-4 pb-4 pt-2">
        <Current sound={sound} />
        <Segmented label="Sound source" options={SOUND_TABS} value={tab} onChange={setTab} fill />
        <Body sound={sound} use="alarm" onPick={onPick} />
      </View>
    </Sheet>
  );
}

export function SoundPicker({
  sound,
  compact,
  disabled,
  title = 'Sound',
  sheetTitle = 'Alarm sound',
  onChange,
}: SoundPickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const text = useSoundText(sound);
  return (
    <>
      <ListRow
        title={title}
        icon={soundIconOf(sound)}
        compact={compact}
        value={text}
        chevron
        expanded={open}
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
      />
      <SoundSheet
        open={open}
        sound={sound}
        title={sheetTitle}
        onClose={() => {
          setOpen(false);
        }}
        onPick={(next) => {
          setOpen(false);
          onChange(next);
        }}
      />
    </>
  );
}
