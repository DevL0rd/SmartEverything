import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiSettings, PhotoAiStatus } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useMutationState } from '../../../store/mutation';
import { setPhotoAiSettings } from './api';
import { useAiStatusStore } from './queries';

export const SMART_SEARCH_NOTE =
  'Sends a small preview of each of your photos to OpenRouter, only to providers that keep nothing and never train on it.';

export const SMART_SEARCH_COST = 'About $0.80 for every 1,000 photos, once.';

export const FACE_NOTE = 'Runs on your home hub. Faces never leave it.';

export const OFF_NOTE = 'Turning a switch off stops its work and deletes what it found.';

interface SwitchRowProps {
  readonly icon: IconName;
  readonly title: string;
  readonly lines: readonly string[];
  readonly value: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

function SwitchRow({ icon, title, lines, value, disabled, onChange }: SwitchRowProps): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-start gap-3 py-2">
      <Icon name={icon} size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong">{title}</Text>
        {lines.map((line) => (
          <Text key={line} variant="footnote" tone="variant">
            {line}
          </Text>
        ))}
      </View>
      <Switch label={title} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}

export function SwitchesCard({
  status,
  live,
}: {
  readonly status: PhotoAiStatus;
  readonly live: boolean;
}): ReactNode {
  const mutation = useMutationState();
  const store = useAiStatusStore();
  const change = (settings: PhotoAiSettings): void => {
    mutation.run(() => setPhotoAiSettings(settings), {
      failure: 'The switch was not changed',
      label: 'photos.smart.settings',
      onDone: store,
    });
  };
  const disabled = !live || mutation.busy;
  return (
    <Card title="Your photos" icon="sparkles">
      <View className="gap-1">
        <SwitchRow
          icon="search"
          title="Smart search and tags"
          lines={[SMART_SEARCH_NOTE, SMART_SEARCH_COST]}
          value={status.smartSearch}
          disabled={disabled}
          onChange={(smartSearch) => {
            change({ smartSearch });
          }}
        />
        <SwitchRow
          icon="users"
          title="Face grouping"
          lines={[FACE_NOTE]}
          value={status.faceGrouping}
          disabled={disabled}
          onChange={(faceGrouping) => {
            change({ faceGrouping });
          }}
        />
        <Text variant="caption" tone="variant" className="pt-1">
          {OFF_NOTE}
        </Text>
      </View>
    </Card>
  );
}
