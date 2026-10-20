import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import type { TargetState } from '@smarteverything/domain';
import { LevelSurface, type LevelShape } from '../../../components/level-surface';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { bandLabel, bandScope, whiteScope, type MemberNoun } from '../group-summary';
import { mixedOf, sharedTint } from '../master-marks';
import type { Master } from '../use-master';

const OFFLINE_TEXT = 'Offline';

interface BandProps {
  readonly state: TargetState;
  readonly colours: Readonly<Record<string, string>>;
  readonly master: Master;
  readonly name: string;
  readonly lights: boolean;
  readonly noun: MemberNoun;
  readonly focusRef?: RefObject<View | null> | undefined;
}

function BandLabel({
  state,
  noun,
}: {
  readonly state: TargetState;
  readonly noun: MemberNoun;
}): ReactNode {
  return (
    <Text variant="label" className="pl-3" numberOfLines={1}>
      {bandLabel(state, noun)}
    </Text>
  );
}

function LightLevel({
  state,
  colours,
  master,
  name,
  noun,
  focusRef,
  shape,
  children,
}: Omit<BandProps, 'lights'> & {
  readonly shape: LevelShape;
  readonly children?: ReactNode;
}): ReactNode {
  const fallback = useColour('on-surface');
  const mixed = mixedOf(state.level, colours, fallback);
  const tint = sharedTint(state, colours);
  return (
    <LevelSurface
      shape={shape}
      showValue={shape !== 'fill'}
      label={`${name} brightness, ${bandScope(state, noun)}`}
      value={state.level === null ? null : state.level.mean}
      disabled={state.power === 'none'}
      focusRef={focusRef}
      {...(tint === undefined ? {} : { tint })}
      {...(mixed === undefined ? {} : { mixed })}
      onChange={master.setLevel}
      onToggle={master.togglePower}
    >
      {shape === 'fill' ? children : <BandLabel state={state} noun={noun} />}
    </LevelSurface>
  );
}

export function LevelBand({
  lights,
  shape = 'bar',
  children,
  ...band
}: BandProps & { readonly shape?: LevelShape; readonly children?: ReactNode }): ReactNode {
  if (lights) {
    return (
      <LightLevel {...band} shape={shape}>
        {children}
      </LightLevel>
    );
  }
  return shape === 'fill' ? (
    <View className="h-full flex-1" pointerEvents="box-none">
      {children}
    </View>
  ) : null;
}

function LightWhite({
  state,
  colours,
  master,
  name,
  noun,
  focusRef,
}: Omit<BandProps, 'lights'>): ReactNode {
  const fallback = useColour('on-surface');
  const mixed = mixedOf(state.whiteTemperature, colours, fallback);
  return (
    <LevelSurface
      variant="white"
      shape="slim"
      label={`${name} white temperature, ${whiteScope(state, noun)}`}
      value={state.whiteTemperature === null ? null : state.whiteTemperature.mean}
      disabled={state.power === 'none' || state.whiteTemperature === null}
      valueText={state.power === 'none' ? OFFLINE_TEXT : undefined}
      focusRef={focusRef}
      {...(mixed === undefined ? {} : { mixed })}
      onChange={master.setWhite}
    />
  );
}

export function WhiteBand({ lights, ...band }: BandProps): ReactNode {
  return lights ? <LightWhite {...band} /> : null;
}
