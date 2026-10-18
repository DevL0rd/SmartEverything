import type { ReactNode } from 'react';
import { harnessTargetKey, type AiChatRow, type Engine } from '@smarteverything/domain';
import { useHarnessCatalogue } from '../data/harness';
import { useEngineCatalogue, useModelMachineChange } from '../provider/provider-data';
import { useIsOwner } from '../../../store/selectors';
import {
  nativeSupplies,
  nativeSupplyReady,
  nativeSupplyEngine,
  type NativeModelRequest,
} from '../provider/subscription-models';
import { isComputerEngine } from '../provider/computer-engine';
import { useEngineAccessory } from './engine-accessories';
import { useHarnessDevice } from '../data/harness-device';
import { useOwnDeviceSelection } from '../data/own-device-selection';
import { harnessHostName } from '../model/harness-context';

export interface MachineChoice {
  readonly key: string;
  readonly label: string;
  readonly reason: string | null;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export interface MachineView {
  readonly name: string;
  readonly choices: readonly MachineChoice[];
  readonly empty: string;
  readonly pending: boolean;
  readonly cancel: (() => void) | null;
}

const EMPTY_CHOICES = 'No machines available';

export function MachineSource({
  engine,
  children,
}: {
  readonly engine: Engine;
  readonly children: (machine: MachineView) => ReactNode;
}): ReactNode {
  const accessory = useEngineAccessory();
  if (accessory === null) return null;
  if (accessory.pending !== null || isComputerEngine(engine)) {
    return <NativeSource engine={engine}>{children}</NativeSource>;
  }
  return accessory.chat === undefined ? (
    <DraftSource engine={engine}>{children}</DraftSource>
  ) : (
    <ChatSource chat={accessory.chat}>{children}</ChatSource>
  );
}

function ChatSource({
  chat,
  children,
}: {
  readonly chat: AiChatRow;
  readonly children: (machine: MachineView) => ReactNode;
}): ReactNode {
  const device = useHarnessDevice(chat);
  const choices = device.items.map((item): MachineChoice => {
    const [label = item.label, ...reason] = item.label.split(' · ');
    return {
      key: item.label,
      label,
      reason: reason.length === 0 ? null : reason.join(' · '),
      selected: item.icon === 'check',
      disabled: item.disabled === true,
      onPress: item.onPress,
    };
  });
  return children({
    name: device.name,
    choices,
    empty: EMPTY_CHOICES,
    pending: false,
    cancel: null,
  });
}

function DraftSource({
  engine,
  children,
}: {
  readonly engine: Engine;
  readonly children: (machine: MachineView) => ReactNode;
}): ReactNode {
  const catalogue = useHarnessCatalogue();
  const accessory = useEngineAccessory();
  const resolve = useOwnDeviceSelection(engine);
  const key = accessory?.host.key;
  const hostOf = (value: string): NonNullable<typeof catalogue.data>['hosts'][number] | undefined =>
    catalogue.data?.hosts.find((row) => harnessTargetKey(row.target) === value);
  const choices = (accessory?.host.options ?? []).map((option): MachineChoice => {
    const host = hostOf(option.value);
    const ready = host !== undefined && resolve(host) !== null;
    let reason: string | null = null;
    if (option.disabled === true) reason = option.description ?? 'Unavailable';
    else if (!ready) reason = 'Model or permissions unavailable.';
    return {
      key: option.value,
      label: option.label,
      reason,
      selected: option.value === key,
      disabled: reason !== null,
      onPress: (): void => {
        if (host === undefined) return;
        const selected = resolve(host, true);
        if (selected === null) return;
        accessory?.host.select(option.value);
        accessory?.change(selected);
      },
    };
  });
  const name =
    engine.kind === 'dsh'
      ? harnessHostName(engine.execution_target, catalogue.data)
      : (hostOf(key ?? '')?.name ?? (key === 'server' ? 'Home hub' : 'Machine unavailable'));
  return children({ name, choices, empty: EMPTY_CHOICES, pending: false, cancel: null });
}

function NativeSource({
  engine,
  children,
}: {
  readonly engine: Engine;
  readonly children: (machine: MachineView) => ReactNode;
}): ReactNode {
  const catalogue = useEngineCatalogue();
  const accessory = useEngineAccessory();
  const owner = useIsOwner();
  const preference = useModelMachineChange();
  const request = nativeRequest(engine, accessory);
  const supplies = request === null ? [] : nativeSupplies(catalogue.data, request);
  const pending = accessory !== null && accessory.pending !== null;
  const choices = supplies.map((supply): MachineChoice => {
    const ready = nativeSupplyReady(supply);
    const current = isComputerEngine(engine) && engine.device_id === supply.computer.device_id;
    return {
      key: `${supply.computer.runtime}:${supply.computer.device_id}`,
      label: supply.computer.name,
      reason: ready ? null : (supply.model.reason ?? supply.computer.reason ?? 'Unavailable'),
      selected: current,
      disabled: !owner || !ready,
      onPress: (): void => {
        if (!owner || !ready || accessory === null) return;
        preference.mutate({
          runtime: supply.computer.runtime,
          model: supply.model.id,
          deviceId: supply.computer.device_id,
        });
        accessory.change(nativeSupplyEngine(supply, engine));
      },
    };
  });
  return children({
    name: pending ? 'Choose machine' : nativeDeviceName(engine, catalogue.data),
    choices,
    empty: catalogue.error?.message ?? EMPTY_CHOICES,
    pending,
    cancel: pending ? accessory.cancel : null,
  });
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
  if (!isComputerEngine(engine)) return 'Choose machine';
  return (
    catalogue?.computers.find(
      (row) => row.device_id === engine.device_id && row.runtime === engine.kind,
    )?.name ?? 'Machine unavailable'
  );
}
