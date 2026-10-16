import { useMemo, useRef, useState } from 'react';
import {
  planGroupCommands,
  readPresentedColor,
  targetCapability,
  writePresentedColor,
  type JsonValue,
  type GroupCommandPlan,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { Control } from '../../store/control';
import { liveCommands } from '../../store/live-commands';
import { memoOnInputs } from '../../store/memo-selector';
import { sameJson } from '../../store/same-json';
import { useEntityStore, useLedger, useStoreSelector } from '../../store/store-context';
import { deviceValuesOf, type Device, type StoreState } from '../../store/state';
import type { GroupControlChoice } from './model';

function reading(
  state: StoreState,
  device: Device,
  presented: PresentedCapability,
  choice: GroupControlChoice,
): JsonValue | undefined {
  const value = deviceValuesOf(state, device.id)[presented.key]?.value;
  if (presented.colorEncoding !== undefined || presented.capability.value.kind === 'color') {
    const colour = readPresentedColor(presented, value);
    return colour === null ? undefined : writePresentedColor(choice.presented, colour);
  }
  const descriptor = presented.capability.value;
  return choice.presented.role === 'brightness' &&
    typeof value === 'number' &&
    descriptor.kind === 'number'
    ? Math.round((value / descriptor.max) * 100)
    : value;
}

function groupValueSelector(
  devices: readonly Device[],
  choice: GroupControlChoice,
): (state: StoreState) => JsonValue | undefined {
  const members = devices.flatMap((device) => {
    const presented = targetCapability(device, choice.reference);
    return presented === undefined ? [] : [{ device, presented }];
  });
  return memoOnInputs(
    (state) => [state.deviceValues, state.ledger],
    (state) => {
      const values = members.map(({ device, presented }) =>
        reading(state, device, presented, choice),
      );
      const first = values[0];
      return first !== undefined && values.every((value) => sameJson(first, value))
        ? first
        : undefined;
    },
  );
}

function issuesOf(
  devices: readonly Device[],
  plan: GroupCommandPlan,
  outcomes: readonly boolean[],
): readonly string[] {
  const name = (id: string): string => devices.find((device) => device.id === id)?.label ?? id;
  return [
    ...plan.skipped.map((skip) => `${name(skip.deviceId)}: ${skip.reason}`),
    ...plan.commands.flatMap((command, index) =>
      outcomes[index] === true ? [] : [`${name(command.device_id)}: did not change`],
    ),
  ];
}

export function useGroupControl(
  devices: readonly Device[],
  choice: GroupControlChoice,
): Control & { readonly issues: readonly string[] } {
  const store = useEntityStore();
  const ledger = useLedger();
  const selectValue = useMemo(() => groupValueSelector(devices, choice), [devices, choice]);
  const value = useStoreSelector(selectValue, sameJson);
  const [draft, setDraft] = useState<{ readonly value: JsonValue } | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const revision = useRef(0);
  return {
    value: draft === null ? value : draft.value,
    observedAt: null,
    pending: false,
    failure: null,
    offline: devices.every((device) => !device.online),
    issues,
    set: async (next): Promise<boolean> => {
      const current = ++revision.current;
      setDraft({ value: next });
      const colour = readPresentedColor(choice.presented, next);
      const plan = planGroupCommands(devices, {
        capability: choice.reference,
        value: colour ?? next,
        ...(choice.presented.role === 'brightness' ? { scale: 'percent' } : {}),
      });
      const outcomes = await Promise.all(
        plan.commands.map(async (command) => {
          const device = devices.find((candidate) => candidate.id === command.device_id);
          return (
            device !== undefined &&
            (await liveCommands(store, ledger).set(device, command.capability, command.value))
          );
        }),
      );
      if (revision.current === current) {
        setDraft(null);
        setIssues(issuesOf(devices, plan, outcomes));
      }
      return outcomes.length > 0 && outcomes.every(Boolean) && plan.skipped.length === 0;
    },
  };
}
