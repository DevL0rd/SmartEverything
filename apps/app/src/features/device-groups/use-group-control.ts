import { useMemo, useState } from 'react';
import {
  readPresentedColor,
  targetCapability,
  writePresentedColor,
  type DeviceTarget,
  type GroupControlChoice,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { Control } from '../../store/control';
import { memoOnInputs } from '../../store/memo-selector';
import { sameJson } from '../../store/same-json';
import { useStoreSelector } from '../../store/store-context';
import { deviceValuesOf, type Device, type StoreState } from '../../store/state';
import { memberNameOf } from './model/member-name';
import { resultLines, shownOutcomes } from './model/outcomes';
import { controlLane } from './control-lane';
import { useOutcomes, useSubmit } from './use-master';

function reading(
  state: StoreState,
  device: Device,
  presented: PresentedCapability,
  choice: GroupControlChoice<Device>,
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
  choice: GroupControlChoice<Device>,
): (state: StoreState) => JsonValue | undefined {
  const members = devices.flatMap((device) => {
    const presented = targetCapability(device, choice.reference);
    return presented === undefined ? [] : [{ device, presented }];
  });
  return memoOnInputs(
    (state) => members.map(({ device }) => deviceValuesOf(state, device.id)),
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

function changeOf(
  choice: GroupControlChoice<Device>,
  value: JsonValue,
): {
  readonly capability: string;
  readonly value: JsonValue;
  readonly scale?: 'percent';
} {
  return {
    capability: choice.reference,
    value: readPresentedColor(choice.presented, value) ?? value,
    ...(choice.presented.role === 'brightness' ? { scale: 'percent' as const } : {}),
  };
}

export function useGroupControl(
  target: DeviceTarget,
  members: readonly Device[],
  choice: GroupControlChoice<Device>,
): Control & { readonly issues: readonly string[] } {
  const [outcomes, setOutcomes] = useOutcomes();
  const submit = useSubmit(members, setOutcomes);
  const selectValue = useMemo(() => groupValueSelector(members, choice), [members, choice]);
  const value = useStoreSelector(selectValue, sameJson);
  const [draft, setDraft] = useState<{ readonly value: JsonValue } | null>(null);
  const push = useMemo(
    () =>
      controlLane(
        (next) => submit(target, changeOf(choice, next), true),
        (latest) => {
          if (latest) setDraft(null);
        },
      ),
    [submit, target, choice],
  );
  return {
    value: draft === null ? value : draft.value,
    pending: false,
    failure: null,
    offline: members.every((device) => !device.online),
    issues: resultLines(shownOutcomes(outcomes), (id) => memberNameOf(members, id)).map(
      (line) => line.text,
    ),
    set: (next): Promise<boolean> => {
      setDraft({ value: next });
      return push(next);
    },
  };
}
