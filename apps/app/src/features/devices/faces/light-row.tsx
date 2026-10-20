import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { ColourDot, ColourSheetDot } from '../controls/colour-shortcut';
import { colourAccessOf } from '../model/light-state';
import { cn } from '../../../design/cn';
import { entering, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import { LevelControl } from './level-control';
import { LightName } from './light-name';
import { LightLine, LightPower, OfflineReason } from './light-parts';
import { LightColourStrip } from './light-colour-strip';
import { RowFrame } from './row-frame';
import { lightLabel, useLight, type LightView } from './use-light';
import { WhiteControl } from './white-control';

function NameButton({
  light,
  expanded,
  onPress,
}: {
  readonly light: LightView;
  readonly expanded: boolean;
  readonly onPress: (() => void) | undefined;
}): ReactNode {
  const names = (
    <>
      {expanded ? (
        <Text variant="callout" numberOfLines={2}>
          {light.name}
        </Text>
      ) : (
        <LightName name={light.name} variant="callout" />
      )}
      <LightLine light={light} withLevel={false} />
    </>
  );
  if (onPress === undefined) {
    return <View className="h-full min-w-0 flex-1 justify-center">{names}</View>;
  }
  return (
    <Interactive
      label={`${lightLabel(light)}, ${expanded ? 'collapse' : 'expand'}`}
      expanded={expanded}
      onPress={onPress}
      className="h-full min-w-0 flex-1 justify-center"
    >
      {names}
    </Interactive>
  );
}

function RowContent({
  light,
  expanded,
  onToggle,
}: {
  readonly light: LightView;
  readonly expanded: boolean;
  readonly onToggle: (() => void) | undefined;
}): ReactNode {
  return (
    <>
      <LightPower light={light} />
      <NameButton light={light} expanded={expanded} onPress={onToggle} />
    </>
  );
}

function Chevron({
  light,
  expanded,
  onPress,
}: {
  readonly light: LightView;
  readonly expanded: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${expanded ? 'Collapse' : 'Expand'} ${light.name}`}
      onPress={onPress}
      className="size-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={20} tone="variant" />
    </Interactive>
  );
}

function RowColour({
  light,
  expanded,
  onToggle,
}: {
  readonly light: LightView;
  readonly expanded: boolean;
  readonly onToggle: (() => void) | undefined;
}): ReactNode {
  const compact = useSizeClass().width === 'compact';
  if (!light.state.online || colourAccessOf(light.parts) === null || expanded || compact) {
    return null;
  }
  if (onToggle === undefined) {
    return <ColourSheetDot device={light.device} colour={light.colour} />;
  }
  return <ColourDot device={light.device} colour={light.colour} onPress={onToggle} />;
}

function Shell({
  light,
  expanded,
  onToggle,
}: {
  readonly light: LightView;
  readonly expanded: boolean;
  readonly onToggle: (() => void) | undefined;
}): ReactNode {
  const { brightness } = light.parts;
  const chevron =
    onToggle === undefined ? null : (
      <Chevron light={light} expanded={expanded} onPress={onToggle} />
    );
  const trailing = (
    <>
      <RowColour light={light} expanded={expanded} onToggle={onToggle} />
      {chevron}
    </>
  );
  const content = <RowContent light={light} expanded={expanded} onToggle={onToggle} />;
  if (brightness === null) {
    return (
      <RowFrame expanded={expanded}>
        {content}
        {trailing}
      </RowFrame>
    );
  }
  return (
    <LevelControl
      device={light.device}
      presented={brightness}
      label={`${light.name} brightness`}
      shape={expanded ? 'rowOpen' : 'row'}
      tint={light.colour ?? undefined}
      trailing={trailing}
    >
      {content}
    </LevelControl>
  );
}

function Expansion({ light }: { readonly light: LightView }): ReactNode {
  const motion = useMotion();
  const { temperature } = light.parts;
  const lit = light.state.online;
  return (
    <Animated.View
      {...entering(motion, FadeIn)}
      className="gap-1.5 rounded-b-md bg-surface-2 px-2.5 pb-2.5"
    >
      {lit ? null : <OfflineReason />}
      {lit || light.state.level === null ? null : (
        <Text variant="footnote" tone="variant">
          {`Last ${String(light.state.level)} %`}
        </Text>
      )}
      {lit && temperature !== null ? <WhiteControl light={light} presented={temperature} /> : null}
      {lit ? <LightColourStrip light={light} density="full" surface="surface-2" /> : null}
      <View className="flex-row justify-end">
        <Button label="Open light" variant="text" href={href.device(light.device)} />
      </View>
    </Animated.View>
  );
}

export function LightRow({
  device,
  expanded,
  onToggleExpand,
}: {
  readonly device: Device;
  readonly expanded: boolean;
  readonly onToggleExpand?: (() => void) | undefined;
}): ReactNode {
  const light = useLight(device);
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      role="group"
      aria-label={lightLabel(light)}
      aria-busy={light.waiting}
      className={cn('min-w-0', pointer ? 'min-h-10' : 'min-h-12')}
    >
      <Shell light={light} expanded={expanded} onToggle={onToggleExpand} />
      {expanded ? <Expansion light={light} /> : null}
    </View>
  );
}
