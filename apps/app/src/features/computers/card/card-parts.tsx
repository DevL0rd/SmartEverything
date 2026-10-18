import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerParts } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { STATUS_FILL } from '../../../components/tone';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { useComputerSelect } from '../data/computer-metrics';
import { computerGlyph } from '../data/computer-device';
import { hotWord, type ComputerStatus } from '../model/computer-view';

const HOT_WORD = 'Running hot';

function rounded(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value);
}

export function Ident({ device }: { readonly device: Device }): ReactNode {
  return <IconWell icon={computerGlyph(device)} colour="viz-blue" size="m" />;
}

function Dot({ status }: { readonly status: ComputerStatus }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 rounded-full',
        status.tone === 'neutral' ? 'bg-on-surface-faint' : STATUS_FILL[status.tone],
      )}
    />
  );
}

function stateWord(status: ComputerStatus): string {
  return status.word === 'Running smoothly' ? 'On' : status.word;
}

function TemperatureText({
  deviceId,
  status,
}: {
  readonly deviceId: string;
  readonly status: ComputerStatus;
}): ReactNode {
  const celsius = useComputerSelect(deviceId, (parts) => rounded(parts.summary?.cpuTemperature));
  if (celsius === null) return null;
  const hot = status.word === HOT_WORD;
  const word = hot ? null : hotWord(celsius);
  const text = word === null ? `${decimal(celsius)} °C` : `${decimal(celsius)} °C · ${word}`;
  return (
    <Text
      variant="footnote"
      tone={hot || word !== null ? 'warning' : 'variant'}
      numberOfLines={1}
      className="tabular"
    >
      {text}
    </Text>
  );
}

export function StateLine({
  deviceId,
  status,
  temperature = true,
}: {
  readonly deviceId: string;
  readonly status: ComputerStatus;
  readonly temperature?: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center gap-1.5">
      <Dot status={status} />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {stateWord(status)}
      </Text>
      {status.offline || !temperature ? null : (
        <TemperatureText deviceId={deviceId} status={status} />
      )}
    </View>
  );
}

interface Charge {
  readonly level: number;
  readonly charging: boolean;
}

function chargeOf(parts: ComputerParts): Charge | null {
  const level = rounded(parts.summary?.batteryLevel);
  return level === null ? null : { level, charging: parts.summary?.charging === true };
}

export function BatteryChip({ deviceId }: { readonly deviceId: string }): ReactNode {
  const charge = useComputerSelect(deviceId, chargeOf, sameJson);
  if (charge === null) return null;
  const text = `${decimal(charge.level)} %`;
  return (
    <View
      accessible
      accessibilityLabel={`Battery ${decimal(charge.level)} percent${charge.charging ? ', charging' : ''}`}
      className="flex-row items-center gap-0.5"
    >
      <View aria-hidden className="flex-row items-center gap-0.5">
        <Icon name={charge.charging ? 'batteryCharging' : 'battery'} size={16} tone="variant" />
        <Text variant="footnote" tone="variant" className="tabular">
          {text}
        </Text>
      </View>
    </View>
  );
}
