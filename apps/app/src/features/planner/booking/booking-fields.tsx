import type { PlannerBookingWindow, PlannerCollectionRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { IconName } from '../../../components/icon';
import { AvailabilityGrid } from './availability-grid';
import type { BookingDraft } from './booking-draft';
import {
  aheadTextOf,
  gridSpanOf,
  spanTextOf,
  weeklyMinutesOf,
  weeklyTextOf,
  type HourSpan,
} from './booking-model';

const DAY_MINUTES = 24 * 60;

const STEP_MINUTES = 5;

const NOTICE_STEP_MINUTES = 15;

export type DraftEdit = Partial<BookingDraft>;

export interface BookingFieldsProps {
  readonly draft: BookingDraft;
  readonly calendars: readonly PlannerCollectionRow[];
  readonly order: readonly number[];
  readonly working: readonly PlannerBookingWindow[];
  readonly day: { readonly start: string; readonly end: string };
  readonly titleError: string | null;
  readonly onChange: (edit: DraftEdit) => void;
}

interface StepRowProps {
  readonly title: string;
  readonly icon: IconName;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}

function StepRow({
  title,
  icon,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: StepRowProps): ReactNode {
  return (
    <ListRow
      title={title}
      icon={icon}
      trailing={
        <NumberStepper
          label={title}
          value={value}
          min={min}
          max={max}
          step={step}
          formatValue={format}
          onChange={onChange}
        />
      }
    />
  );
}

function AboutFields({ draft, titleError, onChange }: BookingFieldsProps): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        value={draft.title}
        placeholder="Intro call"
        error={titleError}
        onChange={(title) => {
          onChange({ title });
        }}
      />
      <TextField
        label="Description"
        value={draft.description}
        placeholder="What the meeting is for, shown on the page"
        multiline
        onChange={(description) => {
          onChange({ description });
        }}
      />
      <TextField
        label="Location"
        value={draft.location}
        placeholder="Video call, an address, or a phone number"
        onChange={(location) => {
          onChange({ location });
        }}
      />
    </View>
  );
}

function TimingRows({ draft, calendars, onChange }: BookingFieldsProps): ReactNode {
  return (
    <List title="Meeting">
      <StepRow
        title="Length"
        icon="timer"
        value={draft.minutes}
        min={STEP_MINUTES}
        max={DAY_MINUTES}
        step={STEP_MINUTES}
        format={spanTextOf}
        onChange={(minutes) => {
          onChange({ minutes });
        }}
      />
      <SelectRow
        title="Calendar"
        icon="calendar"
        placeholder="Pick a calendar"
        options={calendars.map((calendar) => ({ value: calendar.id, label: calendar.name }))}
        value={draft.collection_id}
        onChange={(collectionId) => {
          onChange({ collection_id: collectionId });
        }}
      />
    </List>
  );
}

function BufferRows({ draft, onChange }: BookingFieldsProps): ReactNode {
  return (
    <List title="Free time around each booking">
      <StepRow
        title="Free before"
        icon="arrowUp"
        value={draft.buffer_before}
        min={0}
        max={DAY_MINUTES}
        step={STEP_MINUTES}
        format={spanTextOf}
        onChange={(minutes) => {
          onChange({ buffer_before: minutes });
        }}
      />
      <StepRow
        title="Free after"
        icon="arrowDown"
        value={draft.buffer_after}
        min={0}
        max={DAY_MINUTES}
        step={STEP_MINUTES}
        format={spanTextOf}
        onChange={(minutes) => {
          onChange({ buffer_after: minutes });
        }}
      />
    </List>
  );
}

function WindowRows({ draft, onChange }: BookingFieldsProps): ReactNode {
  return (
    <List title="Booking window">
      <StepRow
        title="Minimum notice"
        icon="hourglass"
        value={draft.notice_minutes}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={NOTICE_STEP_MINUTES}
        format={spanTextOf}
        onChange={(minutes) => {
          onChange({ notice_minutes: minutes });
        }}
      />
      <StepRow
        title="How far ahead"
        icon="calendar"
        value={draft.ahead_days}
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        format={aheadTextOf}
        onChange={(days) => {
          onChange({ ahead_days: days });
        }}
      />
    </List>
  );
}

interface GridActionsProps {
  readonly draft: BookingDraft;
  readonly working: readonly PlannerBookingWindow[];
  readonly zoom: 'day' | 'all' | null;
  readonly onZoom: () => void;
  readonly onChange: (edit: DraftEdit) => void;
}

function GridActions({ draft, working, zoom, onZoom, onChange }: GridActionsProps): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Use working hours"
        icon="clock"
        variant="tonal"
        disabled={working.length === 0}
        onPress={() => {
          onChange({ availability: working });
        }}
      />
      {zoom === null ? null : (
        <Button
          label={zoom === 'all' ? 'Show your day' : 'Show all 24 hours'}
          icon={zoom === 'all' ? 'minimize' : 'maximize'}
          variant="text"
          onPress={onZoom}
        />
      )}
      <Button
        label="Clear"
        icon="eraser"
        variant="text"
        disabled={draft.availability.length === 0}
        onPress={() => {
          onChange({ availability: [] });
        }}
      />
    </View>
  );
}

function zoomOf(allHours: boolean, span: HourSpan): 'day' | 'all' | null {
  if (allHours) return 'all';
  return span.from === 0 && span.to === 24 * 60 ? null : 'day';
}

function AvailabilityFields({
  draft,
  order,
  working,
  day,
  onChange,
}: BookingFieldsProps): ReactNode {
  const [allHours, setAllHours] = useState(false);
  const span = gridSpanOf(draft.availability, allHours ? null : day);
  return (
    <Section title="When you are free" caption={weeklyTextOf(weeklyMinutesOf(draft.availability))}>
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          Tap or drag down a day to open or close half hours.
        </Text>
        <AvailabilityGrid
          windows={draft.availability}
          order={order}
          span={span}
          onChange={(availability) => {
            onChange({ availability });
          }}
        />
        <GridActions
          draft={draft}
          working={working}
          zoom={zoomOf(allHours, span)}
          onZoom={() => {
            setAllHours(!allHours);
          }}
          onChange={onChange}
        />
      </View>
    </Section>
  );
}

export function BookingFields(props: BookingFieldsProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <AboutFields {...props} />
      <AvailabilityFields {...props} />
      <TimingRows {...props} />
      <BufferRows {...props} />
      <WindowRows {...props} />
    </View>
  );
}
