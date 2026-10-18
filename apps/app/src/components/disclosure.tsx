import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, cubicBezier } from 'react-native-reanimated';
import { DURATION, EASING, entering, exiting, useMotion } from '../design/motion';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';
import type { Tone } from './tone';

export const COLLAPSE_LAYOUT = LinearTransition.duration(DURATION.mediumOut).easing(
  EASING.standard,
);

export function CollapseRoot({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  const { reduced } = useMotion();
  return (
    <Animated.View
      {...(reduced ? {} : { layout: COLLAPSE_LAYOUT })}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </Animated.View>
  );
}

export function CollapseBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(DURATION.mediumOut).easing(EASING.standard))}
      {...exiting(motion, FadeOut.duration(DURATION.short))}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </Animated.View>
  );
}

const CHEVRON_EASING = cubicBezier(0.2, 0, 0, 1);

const CHEVRON_STATIC = {
  closed: { transform: [{ rotate: '0deg' }] },
  open: { transform: [{ rotate: '180deg' }] },
} as const;

const CHEVRON_ANIMATED = {
  closed: {
    transform: [{ rotate: '0deg' }],
    transitionProperty: 'transform',
    transitionDuration: DURATION.mediumOut,
    transitionTimingFunction: CHEVRON_EASING,
  },
  open: {
    transform: [{ rotate: '180deg' }],
    transitionProperty: 'transform',
    transitionDuration: DURATION.mediumOut,
    transitionTimingFunction: CHEVRON_EASING,
  },
} as const;

export const TurnChevron = memo(function TurnChevron({
  open,
}: {
  readonly open: boolean;
}): ReactNode {
  const { reduced } = useMotion();
  const styles = reduced ? CHEVRON_STATIC : CHEVRON_ANIMATED;
  return (
    <Animated.View style={open ? styles.open : styles.closed}>
      <Icon name="chevronDown" size={16} tone="variant" />
    </Animated.View>
  );
});

interface DisclosureStatus {
  readonly label: string;
  readonly tone: Tone;
}

interface DisclosureProps {
  readonly label: string;
  readonly accessibleLabel?: string;
  readonly count?: number;
  readonly status?: DisclosureStatus;
  readonly trailing?: ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly hint: string;
  readonly bodyClassName?: string;
  readonly children: ReactNode;
}

function DisclosureHeader({
  label,
  accessibleLabel,
  count,
  status,
  trailing,
  open,
  onToggle,
  hint,
}: Omit<DisclosureProps, 'bodyClassName' | 'children' | 'accessibleLabel'> & {
  readonly accessibleLabel: string;
}): ReactNode {
  return (
    <View className="min-h-touch-min max-w-full justify-center self-start">
      <Interactive
        label={accessibleLabel}
        expanded={open}
        hint={hint}
        hitSlop={10}
        onPress={onToggle}
        className="min-h-6 flex-row items-center gap-1.5 self-start rounded-sm px-1"
        layerClassName="rounded-sm"
      >
        <TurnChevron open={open} />
        <Text variant="caption" tone="variant" numberOfLines={2} className="min-w-0 shrink">
          {label}
        </Text>
        {count === undefined ? null : (
          <Text variant="caption" tone="variant">
            · {String(count)}
          </Text>
        )}
        {status === undefined ? null : (
          <Text variant="caption" tone={status.tone}>
            {status.label}
          </Text>
        )}
        {trailing}
      </Interactive>
    </View>
  );
}

export function Disclosure({ bodyClassName, children, ...header }: DisclosureProps): ReactNode {
  return (
    <CollapseRoot className="min-w-0 gap-1">
      <DisclosureHeader {...header} accessibleLabel={header.accessibleLabel ?? header.label} />
      {header.open ? (
        <CollapseBody {...(bodyClassName === undefined ? {} : { className: bodyClassName })}>
          {children}
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
