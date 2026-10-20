import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BrushCandidate } from '../../../../modules/health-connect';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { SignalBars } from '../../../components/signal-bars';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { signalWord } from '../model/brush-model';

export function CandidateRow({
  candidate,
  picked,
  onPick,
}: {
  readonly candidate: BrushCandidate;
  readonly picked: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      selected={picked}
      label={`${candidate.name}, ${signalWord(candidate.rssi)} signal`}
      onPress={onPick}
      className={cn(
        'min-h-11 flex-row items-center gap-3 rounded-md border-hairline px-4 py-2',
        picked ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
    >
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {candidate.name}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {candidate.stack === 'condor' ? 'Bluetooth pairing needed' : 'No pairing needed'}
        </Text>
      </View>
      <View className="w-20 shrink-0 items-end gap-0.5">
        <SignalBars dbm={candidate.rssi} />
        <Text variant="caption" tone="variant" className="tabular">
          {candidate.rssi} dBm
        </Text>
      </View>
      <View className="size-6 shrink-0 items-center justify-center">
        {picked ? <Icon name="check" size={20} tone="primary" /> : null}
      </View>
    </Interactive>
  );
}
