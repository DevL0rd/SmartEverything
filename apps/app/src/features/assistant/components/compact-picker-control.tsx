import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import type { ComposerClass } from '../model/ai-layout';
import type { EffortSteps } from '../model/composer-state';
import { useComposerClass } from './composer-accessory-layout';

const MODEL_WIDTH: Readonly<Record<ComposerClass, string>> = {
  regular: 'max-w-65',
  compact: 'max-w-45',
  tight: 'max-w-37.5',
};

const METER_BARS = [
  { step: 1, height: 'h-1.25' },
  { step: 2, height: 'h-2' },
  { step: 3, height: 'h-3' },
] as const;

function EffortMeter({ steps }: { readonly steps: EffortSteps }): ReactNode {
  return (
    <View aria-hidden className="h-3 flex-row items-end gap-0.5">
      {METER_BARS.map((bar) => (
        <View
          key={bar.step}
          className={cn(
            'w-0.75 rounded-xs bg-on-surface-variant',
            bar.height,
            bar.step > steps && 'opacity-30',
          )}
        />
      ))}
    </View>
  );
}

export interface CompactPickerControlProps {
  readonly anchorRef: RefObject<View | null>;
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly kind?: 'model' | 'access';
  readonly suffix?: string | null;
  readonly steps?: EffortSteps | null;
  readonly unrestricted?: boolean;
  readonly pending?: boolean;
  readonly leading?: ReactNode;
}

function HoverAnchor({
  anchorRef,
  label,
  className,
  children,
}: {
  readonly anchorRef: RefObject<View | null>;
  readonly label: string;
  readonly className: string;
  readonly children: ReactNode;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      className={className}
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
    >
      {children}
      {hovered && pointer ? <Tooltip text={label} placement="above" /> : null}
    </View>
  );
}

export function CompactPickerControl(props: CompactPickerControlProps): ReactNode {
  const { anchorRef, label, onPress, kind = 'model', suffix = null, steps = null } = props;
  const composerClass = useComposerClass();
  const tight = composerClass === 'tight';
  const iconOnly = kind === 'access' && tight;
  return (
    <HoverAnchor
      anchorRef={anchorRef}
      label={label}
      className={cn(
        'relative',
        kind === 'model' ? cn('min-w-22 shrink', MODEL_WIDTH[composerClass]) : 'shrink-0',
      )}
    >
      <Interactive
        label={label}
        onPress={onPress}
        className={cn(
          'min-h-touch-min min-w-0 justify-center',
          iconOnly && 'min-w-touch-min items-center',
        )}
        layerClassName="rounded-md"
      >
        <PickerFrame
          icon={props.icon}
          leading={props.leading}
          iconOnly={iconOnly}
          unrestricted={props.unrestricted === true}
          pending={props.pending === true}
        >
          <PickerText
            value={iconOnly ? '' : props.value}
            suffix={tight ? null : suffix}
            steps={tight ? steps : null}
            unrestricted={props.unrestricted === true}
          />
        </PickerFrame>
      </Interactive>
    </HoverAnchor>
  );
}

function PickerText({
  value,
  suffix,
  steps,
  unrestricted,
}: {
  readonly value: string;
  readonly suffix: string | null;
  readonly steps: EffortSteps | null;
  readonly unrestricted: boolean;
}): ReactNode {
  return (
    <>
      {value === '' ? null : (
        <Text
          variant="label"
          tone={unrestricted ? 'warning' : 'default'}
          numberOfLines={1}
          className="min-w-0 shrink"
        >
          {value}
        </Text>
      )}
      {suffix === null ? null : (
        <Text variant="label" tone="variant" numberOfLines={1} className="shrink-0">
          {`· ${suffix}`}
        </Text>
      )}
      {steps === null ? null : <EffortMeter steps={steps} />}
    </>
  );
}

function faceSize(iconOnly: boolean, pointer: boolean): string {
  if (iconOnly) {
    return pointer ? 'h-8 w-8' : 'h-10 w-10';
  }
  return pointer ? 'h-8 px-2.5' : 'h-10 px-2.5';
}

function PickerFrame({
  icon,
  leading,
  iconOnly,
  unrestricted,
  pending,
  children,
}: {
  readonly icon: IconName;
  readonly leading: ReactNode;
  readonly iconOnly: boolean;
  readonly unrestricted: boolean;
  readonly pending: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      className={cn(
        'relative min-w-0 flex-row items-center justify-center gap-1.5 rounded-md border-hairline elevation-1',
        faceSize(iconOnly, pointer),
        unrestricted ? 'border-warning/40 bg-warning/14' : 'border-outline-variant bg-surface-1',
      )}
    >
      {leading ?? (
        <Icon name={icon} size={pointer ? 16 : 20} tone={unrestricted ? 'warning' : 'variant'} />
      )}
      {children}
      {pending ? <View className="absolute right-1 top-1 size-2 rounded-full bg-primary" /> : null}
    </View>
  );
}
