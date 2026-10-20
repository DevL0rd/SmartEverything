import type { BottleStatusView, BottleUvStart } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { HoldButton } from '../../../components/hold-button';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useBottleAct } from '../data/bottle-act';

const MODES: readonly { readonly value: BottleUvStart; readonly label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'adventure', label: 'Adventure' },
];

function CleanRow({ view }: { readonly view: BottleStatusView }): ReactNode {
  const { clean } = useBottleAct(view.deviceId);
  const wide = atLeast(useSizeClass().width, 'medium');
  const [mode, setMode] = useState<BottleUvStart>('normal');
  if (!view.mayStartUv) {
    return null;
  }
  return (
    <View className="gap-2 border-t-hairline border-outline-variant pt-4">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="label">UV clean</Text>
        <Text
          variant="caption"
          tone={view.uvRefusal === null ? 'variant' : 'warning'}
          accessibilityLiveRegion="polite"
          className="shrink text-right"
        >
          {view.uvRefusal ?? 'Runs inside the bottle with the cap on'}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-3">
        <View className={cn('min-w-48', !wide && 'flex-1')}>
          <Segmented
            label="Clean mode"
            options={MODES}
            value={mode}
            fill={!wide}
            onChange={setMode}
          />
        </View>
        <View className={cn('min-w-48 flex-row', !wide && 'flex-1')}>
          <HoldButton
            quiet
            grow={!wide}
            label="Hold to clean"
            holdingLabel="Keep holding…"
            action="Start UV clean"
            icon="sparkles"
            enabled={view.uvRefusal === null}
            onHeld={() => {
              clean({ mode });
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function BottleActions({ view }: { readonly view: BottleStatusView }): ReactNode {
  const { act, busy } = useBottleAct(view.deviceId);
  const wide = atLeast(useSizeClass().width, 'medium');
  return (
    <View className="gap-4">
      <View className={cn('flex-row gap-3', wide && 'self-start')}>
        <Button
          label="Measure now"
          icon="ruler"
          variant="filled"
          grow={!wide}
          disabled={busy}
          onPress={() => {
            act({ action: 'measure' }, 'Could not measure the level', true);
          }}
        />
        <Button
          label="Sync now"
          icon="refresh"
          variant="tonal"
          grow={!wide}
          disabled={busy}
          onPress={() => {
            act({ action: 'sync' }, 'Could not sync the bottle', true);
          }}
        />
      </View>
      {view.cap.cleaning ? (
        <Button
          label="Stop cleaning"
          icon="square"
          variant="destructive"
          disabled={busy}
          onPress={() => {
            act({ action: 'uv_stop' }, 'Could not stop the clean', true);
          }}
        />
      ) : null}
      <CleanRow view={view} />
    </View>
  );
}
