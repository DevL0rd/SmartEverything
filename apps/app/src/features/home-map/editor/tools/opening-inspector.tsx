import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  homeMapWallLength,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapWall,
} from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { ListRow } from '../../../../components/list-row';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import type { Device } from '../../../../store/state';
import { useDeviceValue, useDevices } from '../../../../store/selectors';
import {
  LINK_CAPABILITY,
  OPENING_FAMILIES,
  WINDOW_OPENS,
  choiceOf,
  familyKinds,
  familyOf,
  familyOps,
  heightLimits,
  kindOps,
  linkCandidates,
  linkOp,
  linkStatus,
  openingHeightOp,
  openingUpdate,
  plainText,
  resizeOpening,
  slideOp,
  swings,
  windowOpens,
  type Choice,
  type LinkField,
} from './opening-inspector-model';
import { Cm } from './openings-panel';
import { LOCKABLE_KINDS, type WallsOpeningsContext } from './walls-openings-model';

const MIN_WIDTH_M = 0.3;

function send(context: WallsOpeningsContext, ops: readonly (HomeMapOp | null)[]): void {
  const real = ops.filter((op): op is HomeMapOp => op !== null);
  if (real.length > 0) context.edit(real);
}

function Chips<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly Choice<T>[];
  readonly value: T;
  readonly disabled: boolean;
  readonly onChange: (value: T) => void;
}): ReactNode {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-1">
      <Text variant="body-strong">{label}</Text>
      <View className="flex-row flex-wrap gap-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Interactive
              key={option.value}
              role="radio"
              label={option.label}
              selected={selected}
              disabled={disabled}
              onPress={(): void => {
                onChange(option.value);
              }}
              className={cn(
                'min-h-touch-min grow basis-1/4 flex-row items-center justify-center gap-1 rounded-md px-2',
                selected ? 'bg-primary-container' : 'bg-surface-2',
                disabled ? 'opacity-40' : '',
              )}
            >
              <Icon
                name={option.icon}
                size={16}
                tone={selected ? 'onPrimaryContainer' : 'default'}
              />
              <Text variant="caption" tone={selected ? 'onPrimaryContainer' : 'variant'}>
                {option.label}
              </Text>
            </Interactive>
          );
        })}
      </View>
    </View>
  );
}

interface PartProps {
  readonly context: WallsOpeningsContext;
  readonly opening: HomeMapOpening;
  readonly wall: HomeMapWall;
}

function Kind({ context, opening, wall }: PartProps): ReactNode {
  const family = familyOf(opening.kind);
  const kinds = familyKinds(family);
  return (
    <View className="gap-3">
      <Segmented
        label="Kind"
        fill
        value={family}
        disabled={context.readOnly}
        options={OPENING_FAMILIES}
        onChange={(next): void => {
          send(context, familyOps(context.floor.id, opening, wall, next));
        }}
      />
      {kinds.length < 2 ? null : (
        <Chips
          label="Type"
          options={kinds}
          value={choiceOf(opening)}
          disabled={context.readOnly}
          onChange={(choice): void => {
            send(context, kindOps(context.floor.id, opening, wall, choice));
          }}
        />
      )}
    </View>
  );
}

interface Measure {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly op: (metres: number) => HomeMapOp | null;
}

function measures({ context, opening, wall }: PartProps): readonly Measure[] {
  const floorId = context.floor.id;
  const length = homeMapWallLength(wall);
  const top = wall.height ?? context.floor.ceilingHeight;
  const limits = heightLimits(opening);
  const fields: Measure[] = [
    {
      label: 'Width',
      value: opening.width,
      min: MIN_WIDTH_M,
      max: length,
      op: (width) => resizeOpening(floorId, opening, wall, width),
    },
    {
      label: 'Height',
      value: opening.headHeight - opening.sillHeight,
      min: limits.headMin - opening.sillHeight,
      max: top - opening.sillHeight,
      op: (height) => openingHeightOp(floorId, opening, height),
    },
    {
      label: 'From left',
      value: opening.offset,
      min: 0,
      max: length - opening.width,
      op: (offset) => slideOp(floorId, opening, { offset, width: opening.width }),
    },
  ];
  if (opening.kind !== 'window') return fields;
  const sill: Measure = {
    label: 'Above floor',
    value: opening.sillHeight,
    min: 0,
    max: limits.sillMax,
    op: (sillHeight) => openingUpdate(floorId, opening.id, { sillHeight }),
  };
  return [...fields, sill];
}

function Shape(props: PartProps): ReactNode {
  return (
    <View className="gap-3">
      {measures(props).map((measure) => (
        <Cm
          key={measure.label}
          label={measure.label}
          value={measure.value}
          min={measure.min}
          max={measure.max}
          disabled={props.context.readOnly}
          onChange={(metres): void => {
            send(props.context, [measure.op(metres)]);
          }}
        />
      ))}
    </View>
  );
}

const SWING_OPTIONS = [
  { value: 'in', label: 'Inwards' },
  { value: 'out', label: 'Outwards' },
] as const;

const HINGE_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
] as const;

function Opens({ context, opening }: Omit<PartProps, 'wall'>): ReactNode {
  const update = (patch: Readonly<Record<string, unknown>>): void => {
    send(context, [openingUpdate(context.floor.id, opening.id, patch)]);
  };
  const disabled = context.readOnly;
  return (
    <View className="gap-3">
      {opening.kind === 'window' ? (
        <Chips
          label="Opens"
          options={WINDOW_OPENS}
          value={windowOpens(opening)}
          disabled={disabled}
          onChange={(opens): void => {
            update({ opens });
          }}
        />
      ) : null}
      {swings(opening) ? (
        <>
          <Segmented
            label="Swings"
            fill
            value={opening.swing}
            disabled={disabled}
            options={SWING_OPTIONS}
            onChange={(swing): void => {
              update({ swing });
            }}
          />
          <Segmented
            label="Hinge"
            fill
            value={opening.hinge}
            disabled={disabled}
            options={HINGE_OPTIONS}
            onChange={(hinge): void => {
              update({ hinge });
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function LinkRow({
  field,
  device,
  checked,
  disabled,
  onPress,
}: {
  readonly field: LinkField;
  readonly device: Device;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const value = useDeviceValue(device.id, LINK_CAPABILITY[field]);
  const status = linkStatus(field, device, value?.value ?? null);
  return (
    <ListRow
      icon={status.icon}
      iconTone={status.tone}
      title={device.label}
      subtitle={status.text}
      subtitleTone={status.tone}
      checked={checked}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

function LinkPicker({
  context,
  opening,
  field,
  devices,
}: Omit<PartProps, 'wall'> & {
  readonly field: LinkField;
  readonly devices: readonly Device[];
}): ReactNode {
  const title = field === 'contactDeviceId' ? 'Linked contact sensor' : 'Linked lock';
  const choose = (deviceId: string | null): void => {
    send(context, [linkOp(context.floor.id, opening, field, deviceId)]);
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} className="gap-1">
      <Text variant="body-strong">{title}</Text>
      {linkCandidates(devices, field).map((device) => (
        <LinkRow
          key={device.id}
          field={field}
          device={device}
          checked={opening[field] === device.id}
          disabled={context.readOnly}
          onPress={(): void => {
            choose(device.id);
          }}
        />
      ))}
      <ListRow
        icon="ban"
        title={plainText(field, opening.kind)}
        {...(field === 'contactDeviceId' ? { subtitle: 'Always drawn closed' } : {})}
        checked={opening[field] === null}
        disabled={context.readOnly}
        onPress={(): void => {
          choose(null);
        }}
      />
    </View>
  );
}

export function OpeningInspector({ context, opening, wall }: PartProps): ReactNode {
  const devices = useDevices();
  return (
    <View className="gap-4">
      <Kind context={context} opening={opening} wall={wall} />
      <Shape context={context} opening={opening} wall={wall} />
      <Opens context={context} opening={opening} />
      {opening.kind === 'opening' ? null : (
        <LinkPicker context={context} opening={opening} field="contactDeviceId" devices={devices} />
      )}
      {LOCKABLE_KINDS.has(opening.kind) ? (
        <LinkPicker context={context} opening={opening} field="lockDeviceId" devices={devices} />
      ) : null}
      <Button
        label="Delete this opening"
        icon="trash"
        variant="destructive"
        disabled={context.readOnly}
        onPress={(): void => {
          context.edit([
            { op: 'remove', kind: 'opening', floorId: context.floor.id, id: opening.id },
          ]);
          context.dispatch({ type: 'pick', picked: null });
        }}
      />
    </View>
  );
}
