import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiSettings, PhotoAiStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Card } from '../../../components/card';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
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

type SwitchKey = keyof PhotoAiSettings;

const OFF_CONFIRM: Readonly<Record<SwitchKey, ConfirmRequest>> = {
  smartSearch: {
    title: 'Turn off smart search and tags?',
    body: 'Analysis stops and every tag, caption and search match found so far is deleted. Turning it on again analyses your photos again and costs again.',
    confirmLabel: 'Turn off and delete',
    tone: 'destructive',
  },
  faceGrouping: {
    title: 'Turn off face grouping?',
    body: 'Face grouping stops and every face and group it found is deleted. Turning it on again finds them again from the start.',
    confirmLabel: 'Turn off and delete',
    tone: 'destructive',
  },
};

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

function useSwitchChange(): {
  readonly change: (key: SwitchKey, value: boolean) => void;
  readonly busy: boolean;
} {
  const mutation = useMutationState();
  const store = useAiStatusStore();
  const save = (settings: PhotoAiSettings): void => {
    mutation.run(() => setPhotoAiSettings(settings), {
      failure: 'The switch was not changed',
      label: 'photos.smart.settings',
      onDone: store,
    });
  };
  const change = (key: SwitchKey, value: boolean): void => {
    if (value) {
      save({ [key]: true });
      return;
    }
    background(
      confirm(OFF_CONFIRM[key]).then((accepted) => {
        if (accepted) save({ [key]: false });
      }),
      'photos.smart.off_confirm_failed',
    );
  };
  return { change, busy: mutation.busy };
}

export function SwitchesCard({
  status,
  live,
}: {
  readonly status: PhotoAiStatus;
  readonly live: boolean;
}): ReactNode {
  const { change, busy } = useSwitchChange();
  const disabled = !live || busy;
  return (
    <Card title="Your photos" icon="sparkles">
      <View className="gap-1">
        <SwitchRow
          icon="search"
          title="Smart search and tags"
          lines={[SMART_SEARCH_NOTE, SMART_SEARCH_COST]}
          value={status.smartSearch}
          disabled={disabled}
          onChange={(value) => {
            change('smartSearch', value);
          }}
        />
        <SwitchRow
          icon="users"
          title="Face grouping"
          lines={[FACE_NOTE]}
          value={status.faceGrouping}
          disabled={disabled}
          onChange={(value) => {
            change('faceGrouping', value);
          }}
        />
        <Text variant="caption" tone="variant" className="pt-1">
          {OFF_NOTE}
        </Text>
      </View>
    </Card>
  );
}
