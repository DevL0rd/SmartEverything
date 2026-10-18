import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import {
  SIGHT_MEMORY_MAX_SECONDS,
  SIGHT_MEMORY_MIN_SECONDS,
  SIGHT_MEMORY_PRESETS_SECONDS,
  SIGHT_SOURCES,
  type SightMode,
  type SightSource,
} from '@smarteverything/domain';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { selectionTick } from '../../../../platform/haptics';
import { clock } from '../../../../format/time';
import { useStoreSelector } from '../../../../store/store-context';
import { useMoney } from '../../../region';
import { useCall } from '../call-state';
import { callCostOf, memoryText, memoryTokensText, videoPriceOf } from '../model/call-cost';
import { sourceIconOf } from '../model/call-copy';
import { useCallAudio } from './call-audio-pref';

const MODE_OPTIONS = [
  { value: 'live', label: 'Live' },
  { value: 'on_demand', label: 'On demand' },
] as const;

const MODE_HINT: Readonly<Record<SightMode, string>> = {
  live: 'Pictures stream while a source is on. Best for watching you do something.',
  on_demand:
    'One still picture when the assistant needs to see, or when you tap Show this. Cheapest.',
};

export function VideoModeRow(): ReactNode {
  const { pref, change } = useCallAudio();
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">Video mode</Text>
      <Segmented
        label="Video mode"
        options={MODE_OPTIONS}
        value={pref.video_mode}
        onChange={(mode) => {
          change({ video_mode: mode }, `Video mode · ${mode === 'live' ? 'Live' : 'On demand'}`);
        }}
      />
      <Text variant="footnote" tone="variant">
        {MODE_HINT[pref.video_mode]}
      </Text>
    </View>
  );
}

const CUSTOM = 'custom';

const MEMORY_OPTIONS = [
  ...SIGHT_MEMORY_PRESETS_SECONDS.map((seconds) => ({
    value: String(seconds),
    label: memoryText(seconds),
  })),
  { value: CUSTOM, label: 'Custom' },
] as const;

const CUSTOM_STEP = 5;

function isPreset(seconds: number): boolean {
  return SIGHT_MEMORY_PRESETS_SECONDS.some((preset) => preset === seconds);
}

export function MemoryRow(): ReactNode {
  const { pref, change } = useCallAudio();
  const call = useCall();
  const custom = !isPreset(pref.memory_seconds);
  const source: SightSource = call.sight?.source ?? 'phone_camera';
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text variant="body">Video memory</Text>
        <Text variant="label" tone="primary">
          {memoryText(pref.memory_seconds)}
        </Text>
      </View>
      <Segmented
        label="Video memory"
        options={MEMORY_OPTIONS}
        value={custom ? CUSTOM : String(pref.memory_seconds)}
        onChange={(value) => {
          const seconds = value === CUSTOM ? 45 : Number(value);
          change({ memory_seconds: seconds }, `Video memory · ${memoryText(seconds)}`);
        }}
      />
      {custom ? (
        <View className="flex-row items-center gap-3">
          <Text variant="callout" tone="variant">
            Keep the last
          </Text>
          <NumberStepper
            label="Seconds of video kept"
            value={pref.memory_seconds}
            min={SIGHT_MEMORY_MIN_SECONDS}
            max={SIGHT_MEMORY_MAX_SECONDS}
            step={CUSTOM_STEP}
            unit="seconds"
            onChange={(seconds) => {
              change({ memory_seconds: seconds }, `Video memory · ${memoryText(seconds)}`);
            }}
          />
        </View>
      ) : null}
      <Text variant="footnote" tone="variant">
        {`Only the last ${memoryText(pref.memory_seconds)} of video stay in memory (about ${memoryTokensText(source, pref.memory_seconds)}). Older pictures are dropped; the transcript keeps the words.`}
      </Text>
    </View>
  );
}

export function CostEstimateRow(): ReactNode {
  const { pref } = useCallAudio();
  const call = useCall();
  const money = useMoney();
  const model = useStoreSelector((state) => state.assistant?.settings.voice.model ?? null);
  const cost = callCostOf({
    mode: pref.video_mode,
    memorySeconds: pref.memory_seconds,
    source: call.sight?.source ?? 'phone_camera',
    dollarsPerMtok: model === null ? null : videoPriceOf(model),
    money,
  });
  return (
    <View className="gap-1 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text variant="body">Estimated cost</Text>
        <Text variant="label">{cost === null ? 'Price unknown' : cost.rate}</Text>
      </View>
      <Text variant="footnote" tone="variant">
        {pref.video_mode === 'live'
          ? `At 1 picture a second with the last ${memoryText(pref.memory_seconds)} kept. A shorter memory costs less.`
          : 'Each still is billed once, plus the memory it stays in for a short while.'}
      </Text>
    </View>
  );
}

const LOOK_TEXT: Readonly<Record<SightSource, string>> = {
  home_camera: 'Home cameras',
  phone_camera: 'Phone camera',
  phone_screen: 'Phone screen',
  desktop_screen: 'Computer screen',
  desktop_window: 'App windows',
};

const LOOK_CHOICES: readonly { readonly source: SightSource; readonly text: string }[] =
  SIGHT_SOURCES.map((source) => ({ source, text: LOOK_TEXT[source] }));

const TRIGGER_TEXT = {
  ai: 'the assistant looked',
  person: 'you tapped Show this',
  asked: 'you asked',
} as const;

export function LookRow(): ReactNode {
  const { pref, change } = useCallAudio();
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">May look at on its own</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="menu">
        {LOOK_CHOICES.map((choice) => {
          const on = pref.look.includes(choice.source);
          return (
            <Interactive
              key={choice.source}
              role="checkbox"
              checked={on}
              label={choice.text}
              onPress={() => {
                selectionTick();
                const look = on
                  ? pref.look.filter((source) => source !== choice.source)
                  : [...pref.look, choice.source];
                change({ look }, `${choice.text} · ${on ? 'not allowed' : 'allowed'}`);
              }}
              className={cn(
                'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-3',
                on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
              )}
              layerClassName="rounded-full"
            >
              <Icon
                name={on ? 'check' : sourceIconOf(choice.source)}
                size={16}
                tone={on ? 'primary' : 'variant'}
              />
              <Text variant="label" tone={on ? 'primary' : 'default'}>
                {choice.text}
              </Text>
            </Interactive>
          );
        })}
      </View>
      <Text variant="footnote" tone="variant">
        When you ask about something, looking is always allowed. The indicator always shows what it
        looked at.
      </Text>
    </View>
  );
}

export function StillsLog(): ReactNode {
  const call = useCall();
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">Stills this call</Text>
      {call.looks.length === 0 ? (
        <Text variant="footnote" tone="variant">
          Nothing looked at yet.
        </Text>
      ) : (
        call.looks.map((look) => (
          <View key={look.lookId} className="flex-row items-center gap-3">
            <View className="h-11 w-16 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
              {look.picture === null ? (
                <Icon name={sourceIconOf(look.source)} size={20} tone="variant" />
              ) : (
                <Image
                  resizeMethod="resize"
                  source={{ uri: `data:image/jpeg;base64,${look.picture}` }}
                  accessibilityIgnoresInvertColors
                  className="size-full"
                />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="callout" numberOfLines={1}>
                {look.label}
              </Text>
              <Text variant="footnote" tone="variant">
                {`${clock(look.at)} · ${TRIGGER_TEXT[look.trigger]}`}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
