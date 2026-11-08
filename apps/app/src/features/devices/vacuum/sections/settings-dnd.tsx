import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityKey, JsonValue, VacuumValues } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Arc } from '../../../../components/charts';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { SwitchRow } from '../../../../components/rows';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { TimeField, localeUsesHour12, type TimeOfDay } from '../../../../components/time-field';
import { slotOf } from '../../../../store/command-ledger';
import type { Device } from '../../../../store/state';
import { useVacuum } from '../data/use-vacuum';
import { useStoreSelector, useLedger } from '../../../../store/store-context';
import { ledgerEntry } from '../../../../store/subscriptions';
import {
  dndRingOf,
  dndWindowText,
  encodeDndWindow,
  readDndWindow,
  type DndWindow,
} from './dnd-model';

const RING = 64;
const DEFAULT_WINDOW: DndWindow = { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 };

export interface DndKeys {
  readonly enabled: CapabilityKey | undefined;
  readonly period: CapabilityKey | undefined;
}

interface Writes {
  readonly setEnabled: (value: boolean) => void;
  readonly setWindow: (window: DndWindow) => void;
}

function useWrites(device: Device, keys: DndKeys): Writes {
  const ledger = useLedger();
  return useMemo(() => {
    const send = (key: CapabilityKey | undefined, value: JsonValue): void => {
      if (key !== undefined) {
        background(ledger.send(device, key, value), 'vacuum.dnd_failed', {
          deviceId: device.id,
          key,
        });
      }
    };
    return {
      setEnabled: (value): void => {
        send(keys.enabled, value);
      },
      setWindow: (window): void => {
        const encoded = encodeDndWindow(window);
        if (encoded !== null) {
          send(keys.period, encoded);
        }
      },
    };
  }, [device, ledger, keys.enabled, keys.period]);
}

function useRefused(deviceId: string, keys: DndKeys): boolean {
  return useStoreSelector(
    (state) =>
      [keys.enabled, keys.period].some(
        (key) =>
          key !== undefined &&
          (ledgerEntry(state, slotOf(deviceId, key))?.failure ?? null) !== null,
      ),
    Object.is,
    [deviceId, keys.enabled, keys.period],
  );
}

function timeOf(hour: number, minute: number): TimeOfDay {
  return { hour, minute };
}

function SheetActions({
  valid,
  onSave,
  onClose,
}: {
  readonly valid: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button
        label="Save"
        disabled={!valid}
        onPress={() => {
          onClose();
          onSave();
        }}
      />
    </>
  );
}

function WindowSheet({
  initial,
  onSave,
  onClose,
}: {
  readonly initial: DndWindow;
  readonly onSave: (window: DndWindow) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [start, setStart] = useState(timeOf(initial.startHour, initial.startMinute));
  const [end, setEnd] = useState(timeOf(initial.endHour, initial.endMinute));
  const draft: DndWindow = {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
  };
  const valid = encodeDndWindow(draft) !== null;
  const hour12 = localeUsesHour12();
  return (
    <Sheet
      open
      onClose={onClose}
      title="Quiet hours"
      detents={['fit']}
      footer={
        <SheetActions
          valid={valid}
          onSave={() => {
            onSave(draft);
          }}
          onClose={onClose}
        />
      }
    >
      <View className="gap-4 px-4 pb-4">
        <TimeField label="Quiet hours start" value={start} onChange={setStart} hour12={hour12} />
        <TimeField label="Quiet hours end" value={end} onChange={setEnd} hour12={hour12} />
        {valid ? null : (
          <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
            The start and the end must be different times.
          </Text>
        )}
      </View>
    </Sheet>
  );
}

function WindowRow({
  window,
  writable,
  onEdit,
}: {
  readonly window: DndWindow | null;
  readonly writable: boolean;
  readonly onEdit: () => void;
}): ReactNode {
  const ring = window === null ? null : dndRingOf(window);
  return (
    <View className="flex-row items-center gap-4 px-4 py-3">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          window === null ? 'Quiet hours not set' : `Quiet hours ${dndWindowText(window)}`
        }
        className="size-16 items-center justify-center"
      >
        <Arc
          value={ring === null ? 0 : 1}
          size={RING}
          thickness={8}
          colour="primary"
          startAngle={ring?.startAngle ?? 0}
          sweep={ring?.sweep ?? 360}
        />
        <View className="absolute">
          <Icon name="moon" size={20} tone="variant" />
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" className="tabular">
          {window === null ? 'Not set' : dndWindowText(window)}
        </Text>
        <Text variant="footnote" tone="variant">
          The robot stays quiet in this window.
        </Text>
      </View>
      {writable ? <Button label="Change" variant="tonal" onPress={onEdit} /> : null}
    </View>
  );
}

function DndNotes({
  now,
  refused,
}: {
  readonly now: boolean;
  readonly refused: boolean;
}): ReactNode {
  return (
    <>
      {now ? (
        <View className="px-4 pb-3">
          <Badge label="Do not disturb is on now" tone="primary" icon="moon" />
        </View>
      ) : null}
      {refused ? (
        <View className="px-4 pb-3">
          <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
            The robot did not accept the quiet hours change. Try again.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function DndCard({
  device,
  values,
  keys,
}: {
  readonly device: Device;
  readonly values: VacuumValues;
  readonly keys: DndKeys;
}): ReactNode {
  const writes = useWrites(device, keys);
  const refused = useRefused(device.id, keys);
  const [editing, setEditing] = useState(false);
  const enabled = values.dnd === true;
  const window = readDndWindow(values.vacuum_dnd_period);
  const now = values.vacuum_dnd_now === true;
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
      {keys.enabled === undefined ? (
        <ListRow title="Do not disturb" icon="moon" value={enabled ? 'On' : 'Off'} />
      ) : (
        <SwitchRow
          title="Do not disturb"
          icon="moon"
          value={enabled}
          onChange={writes.setEnabled}
        />
      )}
      <WindowRow
        window={window}
        writable={keys.period !== undefined}
        onEdit={() => {
          setEditing(true);
        }}
      />
      <DndNotes now={now} refused={refused} />
      {editing ? (
        <WindowSheet
          initial={window ?? DEFAULT_WINDOW}
          onSave={writes.setWindow}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function DndGroup({ device }: { readonly device: Device }): ReactNode {
  const { snapshot, keyOf } = useVacuum(device);
  const keys = useMemo(
    () => ({ enabled: keyOf('dnd'), period: keyOf('vacuum_dnd_period') }),
    [keyOf],
  );
  return <DndCard device={device} values={snapshot.values} keys={keys} />;
}

export const SETTING_GROUP_BODIES: Readonly<
  Record<string, (props: { readonly device: Device }) => ReactNode>
> = { dnd: DndGroup };
