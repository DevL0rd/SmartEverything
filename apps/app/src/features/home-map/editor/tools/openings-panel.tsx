import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { OpeningInspector } from './opening-inspector';
import { pickedPart, type OpeningKind, type WallsOpeningsContext } from './walls-openings-model';

export const OPENING_KINDS: readonly {
  readonly value: OpeningKind;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { value: 'door', label: 'Door', icon: 'door' },
  { value: 'double_door', label: 'Double door', icon: 'doorOpen' },
  { value: 'sliding_door', label: 'Sliding door', icon: 'move' },
  { value: 'pocket_door', label: 'Pocket door', icon: 'panelLeft' },
  { value: 'garage_door', label: 'Garage door', icon: 'car' },
  { value: 'window', label: 'Window', icon: 'square' },
  { value: 'opening', label: 'Open gap', icon: 'resize' },
];

export const centimetres = (value: number): number => Math.round(value * 100);

export function openingHint(kind: OpeningKind): string {
  const label = OPENING_KINDS.find((item) => item.value === kind)?.label ?? kind;
  return `Tap a wall to put the ${label.toLowerCase()} there`;
}

export function Cm({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly onChange: (metres: number) => void;
}): ReactNode {
  return (
    <NumberStepper
      label={label}
      unit="cm"
      step={1}
      value={centimetres(value)}
      min={centimetres(min)}
      max={Math.max(centimetres(min), centimetres(max))}
      disabled={disabled}
      onChange={(cm): void => {
        onChange(cm / 100);
      }}
    />
  );
}

function KindChips({
  value,
  disabled,
  onChange,
}: {
  readonly value: OpeningKind;
  readonly disabled: boolean;
  readonly onChange: (kind: OpeningKind) => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Kind"
      className="flex-row flex-wrap gap-1"
    >
      {OPENING_KINDS.map((kind) => {
        const selected = kind.value === value;
        return (
          <Interactive
            key={kind.value}
            role="radio"
            label={kind.label}
            selected={selected}
            disabled={disabled}
            onPress={(): void => {
              onChange(kind.value);
            }}
            className={cn(
              'min-h-touch-min grow basis-1/4 flex-row items-center justify-center gap-1 rounded-md px-2',
              selected ? 'bg-primary-container' : 'bg-surface-2',
              disabled ? 'opacity-40' : '',
            )}
          >
            <Icon name={kind.icon} size={16} tone={selected ? 'onPrimaryContainer' : 'default'} />
            <Text
              variant="caption"
              numberOfLines={1}
              tone={selected ? 'onPrimaryContainer' : 'variant'}
            >
              {kind.label}
            </Text>
          </Interactive>
        );
      })}
    </View>
  );
}

export function OpeningsPanel({ context }: { readonly context: WallsOpeningsContext }): ReactNode {
  const part = pickedPart(context.floor, context.state.picked);
  if (part !== null && part.opening !== null) {
    return <OpeningInspector context={context} opening={part.opening} wall={part.wall} />;
  }
  return (
    <KindChips
      value={context.state.openingKind}
      disabled={context.readOnly}
      onChange={(kind): void => {
        context.dispatch({ type: 'style', patch: { openingKind: kind } });
      }}
    />
  );
}
