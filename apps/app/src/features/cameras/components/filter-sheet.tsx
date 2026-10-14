import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { CAMERA_DETECTION_PRESENTATIONS, cameraDetectionsOf } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Section } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import type { CameraEntry } from '../logic/cameras';
import { eventLook } from '../../activity';
import {
  CAMERA_EVENT_KINDS,
  filterCount,
  NO_FILTER,
  type TimelineFilter,
  type TimelineKind,
} from '../logic/timeline';

const KINDS: readonly TimelineKind[] = [...CAMERA_EVENT_KINDS, 'recording'];

function toggled<T>(
  list: readonly T[] | null,
  all: readonly T[],
  value: T,
  on: boolean,
): readonly T[] | null {
  const current = list ?? all;
  const next = on ? [...current, value] : current.filter((entry) => entry !== value);
  return next.length === all.length ? null : next;
}

export interface FilterButtonProps {
  readonly filter: TimelineFilter;
  readonly onChange: (filter: TimelineFilter) => void;
  readonly cameras: readonly CameraEntry[];
}

function CameraChoices({ filter, onChange, cameras }: FilterButtonProps): ReactNode {
  const ids = cameras.map((entry) => entry.device.id);
  return (
    <Section title="Cameras">
      {cameras.map((entry) => (
        <Checkbox
          key={entry.device.id}
          label={entry.name}
          checked={filter.deviceIds?.includes(entry.device.id) ?? true}
          onChange={(on) => {
            onChange({ ...filter, deviceIds: toggled(filter.deviceIds, ids, entry.device.id, on) });
          }}
        />
      ))}
    </Section>
  );
}

function KindChoices({ filter, onChange }: Omit<FilterButtonProps, 'cameras'>): ReactNode {
  return (
    <Section title="What happened">
      {KINDS.map((kind) => (
        <Checkbox
          key={kind}
          label={eventLook(kind).label}
          checked={filter.kinds?.includes(kind) ?? true}
          onChange={(on) => {
            onChange({ ...filter, kinds: toggled(filter.kinds, KINDS, kind, on) });
          }}
        />
      ))}
    </Section>
  );
}

function SoundChoices({ filter, onChange }: Omit<FilterButtonProps, 'cameras'>): ReactNode {
  const chosen = filter.soundDetections ?? null;
  return (
    <Section title="Sound details">
      <Checkbox
        label="Any sound"
        checked={chosen === null}
        onChange={(on) => {
          onChange({ ...filter, soundDetections: on ? null : [] });
        }}
      />
      {cameraDetectionsOf('sound').map((detection) => (
        <Checkbox
          key={detection}
          label={CAMERA_DETECTION_PRESENTATIONS[detection].label}
          checked={chosen?.includes(detection) ?? false}
          onChange={(on) => {
            const current = chosen ?? [];
            onChange({
              ...filter,
              soundDetections: on
                ? [...current, detection]
                : current.filter((entry) => entry !== detection),
            });
          }}
        />
      ))}
    </Section>
  );
}

export function FilterButton(props: FilterButtonProps): ReactNode {
  const [open, setOpen] = useState(false);
  const count = filterCount(props.filter);
  return (
    <>
      <Button
        label={count === 0 ? 'Filter' : `Filter · ${String(count)}`}
        icon="filter"
        variant={count === 0 ? 'outlined' : 'tonal'}
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Filter"
        detents={['half', 'full']}
        footer={
          <View className="flex-row justify-end gap-2">
            <Button
              label="Show all"
              variant="text"
              disabled={count === 0}
              onPress={() => {
                props.onChange(NO_FILTER);
              }}
            />
            <Button
              label="Done"
              onPress={() => {
                setOpen(false);
              }}
            />
          </View>
        }
      >
        <View className="gap-section-gap px-4 pb-4">
          {props.cameras.length > 1 ? <CameraChoices {...props} /> : null}
          <KindChoices filter={props.filter} onChange={props.onChange} />
          <SoundChoices filter={props.filter} onChange={props.onChange} />
        </View>
      </Sheet>
    </>
  );
}
