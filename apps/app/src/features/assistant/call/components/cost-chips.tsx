import type { ReactNode } from 'react';
import { View } from 'react-native';
import { voiceModelFor, type CallAudioPref } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { useStoreSelector } from '../../../../store/store-context';
import { useMoney } from '../../../region';
import type { CallView } from '../call-state';
import { memoryText, callCostOf, videoPriceOf, type CallCost } from '../model/call-cost';

function Chip({ icon, text }: { readonly icon: IconName; readonly text: string }): ReactNode {
  return (
    <View className="h-8 flex-row items-center gap-1.5 rounded-full bg-surface-2/85 px-2.5">
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function useVideoPrice(): number | null {
  const level = useStoreSelector((state) => state.assistant?.settings.voice.thinking_level ?? null);
  return level === null ? null : videoPriceOf(voiceModelFor(level));
}

function costText(pref: CallAudioPref, looks: number, cost: CallCost | null): string {
  if (pref.video_mode === 'on_demand') {
    const so = looks === 0 ? '' : ` · ${String(looks)} so far`;
    return `On demand${cost === null ? '' : ` · ${cost.rate}`}${so}`;
  }
  return `Live${cost === null ? '' : ` · ${cost.rate}`}`;
}

export function CostChips({
  call,
  pref,
}: {
  readonly call: CallView;
  readonly pref: CallAudioPref;
}): ReactNode {
  const price = useVideoPrice();
  const money = useMoney();
  if (call.sight === null) {
    return null;
  }
  const cost = callCostOf({
    mode: pref.video_mode,
    memorySeconds: pref.memory_seconds,
    source: call.sight.source,
    dollarsPerMtok: price,
    money,
  });
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1.5 px-2">
      <Chip icon="eye" text={costText(pref, call.looks.length, cost)} />
      {pref.video_mode === 'live' ? (
        <Chip icon="clock" text={`${memoryText(pref.memory_seconds)} memory`} />
      ) : null}
    </View>
  );
}
