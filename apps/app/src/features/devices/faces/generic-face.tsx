import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import type { Device } from '../../../store/state';
import { familyIcon } from '../../device-visuals';
import { ControlsArea } from '../card/card-controls';
import { Names } from '../card/card-parts';
import { GENERIC_FACES } from '../card/card-faces';
import { nominalFrame } from '../card/nominal-frame';
import { StandaloneShell } from '../card/standalone-shell';
import { usePowerAction } from '../controls/power-toggle';
import { LEVEL_ROLES } from '../model/card-facts';
import { deviceModelOf, useDeviceModel } from '../model/device-model';
import { useDisplayName } from '../model/display-name';
import { LevelControl } from './level-control';
import { RowFrame } from './row-frame';
import { RowPower } from './row-power';
import type { FaceName, FaceProps } from './face-types';
import { DeviceTile } from '../tile/device-tile';

const EXPANDED_BOX = { width: 320, height: 168, idiom: 'touch' } as const;
const EXPANDED_CONTROLS = 3;
const STATE_WORD = { on: 'On', off: 'Off' } as const;

function levelPart(device: Device): ReturnType<typeof deviceModelOf>['curated'][number] | null {
  return (
    deviceModelOf(device).curated.find(
      (presented) =>
        presented.capability.value.kind === 'number' &&
        presented.role !== null &&
        LEVEL_ROLES.has(presented.role),
    ) ?? null
  );
}

function GenericChip({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const power = usePowerAction(device);
  const word = power.state === 'on' || power.state === 'off' ? STATE_WORD[power.state] : '';
  return (
    <Interactive
      role="switch"
      checked={power.state === 'on'}
      label={`${name}, ${word}`}
      disabled={!device.online || power.state === 'none'}
      onPress={power.toggle}
      hitSlop={{ top: 8, bottom: 8 }}
      className="h-8 min-w-24 max-w-45 flex-row items-center gap-2 rounded-full border-hairline border-outline-variant bg-surface-2 px-2"
      layerClassName="rounded-full"
    >
      <Icon
        name={familyIcon(model.family)}
        size={16}
        tone={power.state === 'on' ? 'primary' : 'variant'}
      />
      <Text variant="callout" numberOfLines={1} className="shrink">
        {name}
      </Text>
      <Text variant="caption" tone="variant">
        {device.online ? word : 'Offline'}
      </Text>
    </Interactive>
  );
}

function RowBody({
  device,
  expanded,
  onToggleExpand,
}: {
  readonly device: Device;
  readonly expanded: boolean;
  readonly onToggleExpand: (() => void) | undefined;
}): ReactNode {
  const name = useDisplayName(device.id);
  const model = useDeviceModel(device);
  return (
    <>
      <RowPower
        device={device}
        icon="power"
        offline={!device.online && !model.sleepy}
        ring={null}
      />
      {onToggleExpand === undefined ? (
        <View className="h-full min-w-0 flex-1 justify-center">
          <Names device={device} look="row" />
        </View>
      ) : (
        <Interactive
          label={`${name}, ${expanded ? 'collapse' : 'expand'}`}
          expanded={expanded}
          onPress={onToggleExpand}
          className="h-full min-w-0 flex-1 justify-center"
        >
          <Names device={device} look="row" />
        </Interactive>
      )}
    </>
  );
}

function GenericRow({
  device,
  expanded,
  onToggleExpand,
}: {
  readonly device: Device;
  readonly expanded: boolean;
  readonly onToggleExpand: (() => void) | undefined;
}): ReactNode {
  const level = levelPart(device);
  const body = <RowBody device={device} expanded={expanded} onToggleExpand={onToggleExpand} />;
  return (
    <View className="min-w-0">
      {level === null ? (
        <RowFrame expanded={expanded}>{body}</RowFrame>
      ) : (
        <LevelControl
          device={device}
          presented={level}
          label={`${device.label} ${level.label}`}
          shape={expanded ? 'rowOpen' : 'row'}
        >
          {body}
        </LevelControl>
      )}
      {expanded ? (
        <View className="min-h-12 rounded-b-md bg-surface-2 px-2.5 pb-2.5">
          <ControlsArea device={device} box={EXPANDED_BOX} max={EXPANDED_CONTROLS} dense />
        </View>
      ) : null}
    </View>
  );
}

function GenericCard({
  device,
  face,
}: {
  readonly device: Device;
  readonly face: FaceName;
}): ReactNode {
  const idiom = useIdiom();
  const size = face === 'card' ? 'M' : 'XL';
  const Face = GENERIC_FACES[face === 'card' ? 'm' : 'l'];
  return (
    <StandaloneShell device={device} editing={false} quickControls={false} padded>
      <Face device={device} box={nominalFrame(size, idiom)} size={size} />
    </StandaloneShell>
  );
}

export function GenericFaceOf({
  device,
  face,
  context,
  onToggleExpand,
}: Omit<FaceProps, 'deviceId'> & { readonly device: Device }): ReactNode {
  switch (face) {
    case 'chip':
      return <GenericChip device={device} />;
    case 'row':
    case 'row-expanded':
      return (
        <GenericRow
          device={device}
          expanded={face === 'row-expanded'}
          onToggleExpand={onToggleExpand}
        />
      );
    case 'tile':
      return <DeviceTile device={device} />;
    case 'card':
    case 'panel':
      return context === 'nested' ? null : <GenericCard device={device} face={face} />;
  }
}
