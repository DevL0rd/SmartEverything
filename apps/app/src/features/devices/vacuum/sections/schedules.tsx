import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { createAutomation } from '../../../../api/automations';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Interactive } from '../../../../components/interactive';
import { Switch } from '../../../../components/switch';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { cn } from '../../../../design/cn';
import type { Device } from '../../../../store/state';
import {
  links,
  toggleAutomation,
  vacuumScheduleAutomation,
  type VacuumScheduleEntry,
} from '../../../automations';
import { useDisplayName } from '../../model/display-name';
import { parseMapVersion } from '../data/map-feed';
import { useVacuumScene } from '../data/scene-query';
import { useVacuum } from '../data/use-vacuum';
import { useNextRunDays, useVacuumSchedules } from '../data/use-vacuum-schedules';
import { readingOf, valueOrNull } from '../model/readings';
import {
  WEEK,
  cleansText,
  daysText,
  ownScheduleName,
  roomNameOf,
  scheduleFootnote,
  scheduleLabel,
  scheduleName,
  timesText,
} from '../model/schedule-text';
import { ScheduleSheet, type ScheduleChoice, type ScheduleRoom } from './schedule-sheet';

const log = new Logger('app.devices');

interface Rooms {
  readonly list: readonly ScheduleRoom[];
  readonly names: ReadonlyMap<number, string>;
}

function useRooms(device: Device): Rooms {
  const { snapshot } = useVacuum(device);
  const version = valueOrNull(readingOf(() => parseMapVersion(snapshot.mapVersionText)));
  const scene = useVacuumScene(device.id, version).scene;
  return useMemo(() => {
    const list = (scene?.rooms ?? [])
      .filter((room) => !room.hidden)
      .map((room) => ({ id: room.id, name: room.name }));
    return { list, names: new Map(list.map((room) => [room.id, room.name])) };
  }, [scene]);
}

function DayDots({ days }: { readonly days: readonly number[] }): ReactNode {
  return (
    <View aria-hidden className="flex-row gap-1">
      {WEEK.map((entry) => (
        <View
          key={entry.day}
          className={cn(
            'size-6 items-center justify-center rounded-full',
            days.includes(entry.day) ? 'bg-primary' : 'bg-surface-3',
          )}
        >
          <Text variant="caption" tone={days.includes(entry.day) ? 'onPrimary' : 'variant'}>
            {entry.letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ScheduleRow({
  entry,
  rooms,
  next,
  deviceLabel,
}: {
  readonly entry: VacuumScheduleEntry;
  readonly rooms: Rooms;
  readonly next: string | null;
  readonly deviceLabel: string;
}): ReactNode {
  const [first] = entry.times;
  const days = first?.days ?? [];
  return (
    <View className="flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 pr-4">
      <Interactive
        href={links.edit(entry.automationId)}
        label={scheduleLabel(entry, rooms.names, next)}
        hint="Opens the automation"
        className="min-h-touch-min min-w-0 flex-1 gap-2 p-4"
        layerClassName="rounded-lg"
      >
        <View className="flex-row items-baseline gap-3">
          <Text variant="title-1" className="tabular" numberOfLines={1}>
            {entry.times.map((time) => time.at).join(' · ')}
          </Text>
          <Text variant="footnote" tone="variant" className="flex-1" numberOfLines={1}>
            {entry.times.length === 1 ? daysText(days) : timesText(entry.times)}
          </Text>
        </View>
        <DayDots days={days} />
        <Text variant="body-strong" numberOfLines={2}>
          {cleansText(entry.cleans, rooms.names)}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {scheduleFootnote(next, ownScheduleName(entry, deviceLabel, rooms.names))}
        </Text>
      </Interactive>
      <Switch
        label={`${entry.name} on`}
        value={entry.enabled}
        onChange={(on) => {
          toggleAutomation(entry.automationId, on);
        }}
      />
    </View>
  );
}

function useAddSchedule(device: Device, rooms: Rooms): (choice: ScheduleChoice) => Promise<void> {
  const router = useRouter();
  const label = useDisplayName(device.id);
  return async (choice) => {
    const names = choice.rooms.map((room) => roomNameOf(room, rooms.names));
    const draft = vacuumScheduleAutomation({
      deviceId: device.id,
      name: scheduleName(label, names, choice.at),
      ...choice,
    });
    const reply = await createAutomation({ ...draft, enabled: true });
    if (reply.id === null) {
      throw new Error(`The hub created no automation for ${draft.name}`);
    }
    router.push(links.edit(reply.id));
  };
}

function AddFlow({
  device,
  rooms,
  onClose,
}: {
  readonly device: Device;
  readonly rooms: Rooms;
  readonly onClose: () => void;
}): ReactNode {
  const add = useAddSchedule(device, rooms);
  const [saving, setSaving] = useState(false);
  const save = (choice: ScheduleChoice): void => {
    setSaving(true);
    background(
      add(choice).then(onClose, (error: unknown) => {
        setSaving(false);
        log.error('vacuum.schedule_create_failed', error, { deviceId: device.id });
        notify({ message: 'The schedule wasn’t added', tone: 'critical', error });
      }),
      'vacuum.schedule_create_failed',
    );
  };
  return <ScheduleSheet rooms={rooms.list} saving={saving} onSave={save} onClose={onClose} />;
}

export function VacuumSchedules({ device }: { readonly device: Device }): ReactNode {
  const entries = useVacuumSchedules(device.id);
  const rooms = useRooms(device);
  const next = useNextRunDays(entries);
  const deviceLabel = useDisplayName(device.id);
  const [adding, setAdding] = useState(false);
  const open = (): void => {
    setAdding(true);
  };
  const add = <Button label="Add schedule" icon="plus" onPress={open} />;
  return (
    <View className="gap-3">
      {entries.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No schedules yet. Add one."
          body="A schedule is an automation that starts this robot at set times."
          action={add}
        />
      ) : (
        <>
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="body-strong" accessibilityRole="header">
              Schedules
            </Text>
            {add}
          </View>
          {entries.map((entry) => (
            <ScheduleRow
              key={entry.automationId}
              entry={entry}
              rooms={rooms}
              next={next.get(entry.automationId)?.day ?? null}
              deviceLabel={deviceLabel}
            />
          ))}
        </>
      )}
      {adding ? (
        <AddFlow
          device={device}
          rooms={rooms}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </View>
  );
}
