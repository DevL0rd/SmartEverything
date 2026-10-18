import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ListeningPowerMode } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { DrainBar } from './drain-bar';
import { POWER_MODES, type PowerModeInfo } from './listener-model';

function Radio({ on }: { readonly on: boolean }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-5 items-center justify-center rounded-full border-2',
        on ? 'border-primary' : 'border-outline',
      )}
    >
      {on ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

function ModeRow({
  info,
  selected,
  disabled,
  onSelect,
}: {
  readonly info: PowerModeInfo;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (mode: ListeningPowerMode) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      checked={selected}
      disabled={disabled}
      label={`${info.label}. ${info.summary} Battery cost: ${info.drainText}`}
      onPress={() => {
        selectionTick();
        onSelect(info.mode);
      }}
      className={cn(
        'min-h-touch-min gap-2 rounded-lg px-4 py-3',
        selected ? 'border border-primary/40 bg-primary-container/30' : 'bg-surface-2',
        disabled && 'opacity-40',
      )}
    >
      <View className="flex-row items-center gap-3">
        <Radio on={selected} />
        <Icon name={info.icon} size={20} tone={selected ? 'primary' : 'variant'} />
        <Text variant="body-strong" className="min-w-0 flex-1">
          {info.label}
        </Text>
      </View>
      <View className="gap-1.5 pl-13">
        <Text variant="footnote" tone="variant">
          {info.summary}
        </Text>
        <DrainBar level={info.drain} text={info.drainText} />
      </View>
    </Interactive>
  );
}

export function PowerModeList({
  value,
  disabled,
  onSelect,
}: {
  readonly value: ListeningPowerMode;
  readonly disabled: boolean;
  readonly onSelect: (mode: ListeningPowerMode) => void;
}): ReactNode {
  return (
    <View accessibilityRole="radiogroup" className="gap-2">
      {POWER_MODES.map((info) => (
        <ModeRow
          key={info.mode}
          info={info}
          selected={info.mode === value}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
