import { useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { harnessTargetKey, type AiChatRow, type Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from '../data/harness';
import { useEngineCatalogue, useModelMachineChange } from '../provider/provider-data';
import { useIsOwner } from '../../../store/selectors';
import {
  nativeSupplies,
  nativeSupplyReady,
  nativeSupplyEngine,
  type NativeSupply,
  type NativeModelRequest,
} from '../provider/subscription-models';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineAccessory } from './engine-accessories';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Tooltip } from '../../../components/tooltip';
import { useIdiom } from '../../../design/platform';
import { useHarnessDevice } from '../data/harness-device';
import { useOwnDeviceSelection } from '../data/own-device-selection';
import type { SelectOption } from '../../../components/select';
import { harnessHostName } from '../model/harness-context';

export function DeviceChip({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const device = useHarnessDevice(chat);
  return <DeviceControl name={device.name} items={device.items} />;
}

export function DraftDeviceChip({
  engine,
  onChange,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  const catalogue = useHarnessCatalogue();
  const accessory = useEngineAccessory();
  const resolve = useOwnDeviceSelection(engine);
  const key = accessory?.host.key;
  const items =
    accessory?.host.options.map((option): MenuItem => ({
      label: draftHostLabel(option, draftHostReady(option.value, catalogue.data, resolve)),
      icon: option.value === key ? 'check' : 'monitor',
      disabled: option.disabled === true || !draftHostReady(option.value, catalogue.data, resolve),
      onPress: (): void => {
        const host = catalogue.data?.hosts.find(
          (row) => harnessTargetKey(row.target) === option.value,
        );
        if (host === undefined) return;
        const selected = resolve(host, true);
        if (selected === null) return;
        accessory.host.select(option.value);
        onChange(selected);
      },
    })) ?? [];
  return <DeviceControl name={draftDeviceName(engine, accessory, catalogue.data)} items={items} />;
}

function draftDeviceName(
  engine: Engine,
  accessory: ReturnType<typeof useEngineAccessory>,
  catalogue: ReturnType<typeof useHarnessCatalogue>['data'],
): string {
  if (engine.kind === 'dsh') return harnessHostName(engine.execution_target, catalogue);
  const key = accessory?.host.key;
  const host = catalogue?.hosts.find((row) => harnessTargetKey(row.target) === key);
  return host?.name ?? (key === 'server' ? 'Home hub' : 'Host unavailable');
}

function draftHostLabel(option: SelectOption<string>, ready: boolean): string {
  if (option.disabled === true) return `${option.label} · ${option.description ?? 'Unavailable'}`;
  return ready ? option.label : `${option.label} · Model or permissions unavailable.`;
}

function draftHostReady(
  key: string,
  catalogue: ReturnType<typeof useHarnessCatalogue>['data'],
  resolve: ReturnType<typeof useOwnDeviceSelection>,
): boolean {
  const host = catalogue?.hosts.find((row) => harnessTargetKey(row.target) === key);
  return host !== undefined && resolve(host) !== null;
}

function DeviceControl({
  name,
  items,
  pending = false,
}: {
  readonly name: string;
  readonly items: readonly MenuItem[];
  readonly pending?: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'Device');
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const opened = useRef(false);
  useEffect(() => {
    if (operation === 'device') {
      open();
      router.setParams({ work: undefined, operation: undefined });
    }
  }, [operation, open]);
  useEffect(() => {
    if (pending && !opened.current) {
      opened.current = true;
      open();
    }
    if (!pending) opened.current = false;
  }, [pending, open]);
  return (
    <View ref={ref} collapsable={false} className="min-w-0 shrink">
      <Interactive
        label={`Device: ${name}`}
        onPress={open}
        className="min-h-touch-min max-w-40 justify-center"
        layerClassName="rounded-full"
      >
        <DeviceFace name={name} />
      </Interactive>
      {menu}
    </View>
  );
}

export function NativeDeviceChip({
  engine,
  blocked,
}: {
  readonly engine: Engine;
  readonly blocked: boolean;
}): ReactNode {
  const catalogue = useEngineCatalogue();
  const accessory = useEngineAccessory();
  const owner = useIsOwner();
  const preference = useModelMachineChange();
  const request = nativeRequest(engine, accessory);
  const supplies = request === null ? [] : nativeSupplies(catalogue.data, request);
  const choose = (supply: NativeSupply): void => {
    if (!owner || blocked || !nativeSupplyReady(supply) || accessory === null) return;
    preference.mutate({
      runtime: supply.computer.runtime,
      model: supply.model.id,
      deviceId: supply.computer.device_id,
    });
    accessory.change(nativeSupplyEngine(supply, engine));
  };
  const items = nativeItems(supplies, { engine, blocked: blocked || !owner, choose });
  if (accessory !== null && accessory.pending !== null)
    items.push({ label: 'Cancel model selection', onPress: accessory.cancel });
  if (items.length === 0)
    items.push({
      label: catalogue.error?.message ?? 'No supplying devices available',
      disabled: true,
      onPress: (): void => undefined,
    });
  const pending = accessory !== null && accessory.pending !== null;
  const name = pending ? 'Choose device' : nativeDeviceName(engine, catalogue.data);
  return <DeviceControl name={name} items={items} pending={pending} />;
}

function nativeRequest(
  engine: Engine,
  accessory: ReturnType<typeof useEngineAccessory>,
): NativeModelRequest | null {
  if (accessory !== null && accessory.pending !== null) return accessory.pending;
  return isComputerEngine(engine) ? { runtime: engine.kind, model: engine.model } : null;
}
function nativeDeviceName(
  engine: Engine,
  catalogue: ReturnType<typeof useEngineCatalogue>['data'],
): string {
  if (!isComputerEngine(engine)) return 'Choose device';
  return (
    catalogue?.computers.find(
      (row) => row.device_id === engine.device_id && row.runtime === engine.kind,
    )?.name ?? 'Device unavailable'
  );
}
function nativeItems(
  supplies: readonly NativeSupply[],
  context: {
    readonly engine: Engine;
    readonly blocked: boolean;
    readonly choose: (supply: NativeSupply) => void;
  },
): MenuItem[] {
  return supplies.map((supply): MenuItem => ({
    label: nativeDeviceLabel(supply),
    disabled: context.blocked || !nativeSupplyReady(supply),
    icon:
      isComputerEngine(context.engine) && context.engine.device_id === supply.computer.device_id
        ? 'check'
        : 'monitor',
    onPress: (): void => {
      context.choose(supply);
    },
  }));
}
function nativeDeviceLabel(supply: NativeSupply): string {
  const name = supply.computer.name;
  if (nativeSupplyReady(supply)) return name;
  return `${name} · ${supply.model.reason ?? supply.computer.reason ?? 'Unavailable'}`;
}

function DeviceFace({ name }: { readonly name: string }): ReactNode {
  const [hovered, setHovered] = useState(false);
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
      className="h-10 flex-row items-center gap-1.5 rounded-full bg-surface-1 px-2"
    >
      <Icon name="monitor" size={16} tone="variant" />
      <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
        {name}
      </Text>
      <Icon name="chevronDown" size={16} tone="variant" />
      {hovered && pointer ? <Tooltip text={`Device: ${name}`} /> : null}
    </View>
  );
}
