import type { PlannerBookingPageRow, PlannerPreferences } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { notifyFailure } from '../../../components/toast-store';
import { weekOrderOf } from '../clock/alarm-text';
import { usePlannerBookingWrites, usePlannerCollections, type PlannerPerson } from '../data';
import {
  changesOf,
  createBodyOf,
  draftOf,
  draftProblemOf,
  type BookingDraft,
} from './booking-draft';
import { BookingFields, type DraftEdit } from './booking-fields';
import { bookingCalendarsOf, workingWindowsOf } from './booking-model';

export interface BookingEditorProps {
  readonly person: PlannerPerson;
  readonly page: PlannerBookingPageRow | null;
  readonly prefs: PlannerPreferences;
  readonly open: boolean;
  readonly onClose: () => void;
}

interface Footer {
  readonly draft: BookingDraft;
  readonly page: PlannerBookingPageRow | null;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

function EditorFooter({ draft, page, saving, onSave, onCancel }: Footer): ReactNode {
  const ready = page === null ? createBodyOf(draft) !== null : changesOf(page, draft) !== null;
  return (
    <View className="flex-row justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={onCancel} />
      <Button
        label={page === null ? 'Create page' : 'Save'}
        icon="check"
        loading={saving}
        disabled={!ready}
        onPress={onSave}
      />
    </View>
  );
}

function useEditorSetup(
  person: PlannerPerson,
  prefs: PlannerPreferences,
): {
  readonly order: readonly number[];
  readonly working: ReturnType<typeof workingWindowsOf>;
  readonly calendars: ReturnType<typeof bookingCalendarsOf>;
  readonly day: { readonly start: string; readonly end: string };
} {
  return {
    order: weekOrderOf(prefs.general.week_start),
    working: workingWindowsOf(prefs.general.working_hours),
    calendars: bookingCalendarsOf(usePlannerCollections(person)),
    day: { start: prefs.general.day_start, end: prefs.general.day_end },
  };
}

function useSave(
  person: PlannerPerson,
  page: PlannerBookingPageRow | null,
  onClose: () => void,
): { readonly saving: boolean; readonly save: (draft: BookingDraft) => void } {
  const writes = usePlannerBookingWrites(person);
  const [saving, setSaving] = useState(false);
  const workOf = (draft: BookingDraft): Promise<unknown> | null => {
    if (page === null) {
      const body = createBodyOf(draft);
      return body === null ? null : writes.create(body);
    }
    const changes = changesOf(page, draft);
    return changes === null ? null : writes.update(page.id, changes);
  };
  const save = (draft: BookingDraft): void => {
    const work = workOf(draft);
    if (work === null) return;
    setSaving(true);
    background(
      work
        .then(onClose)
        .catch(notifyFailure('The booking page could not be saved'))
        .finally(() => {
          setSaving(false);
        }),
      'planner.booking_save_failed',
    );
  };
  return { saving, save };
}

export function BookingEditor({
  person,
  page,
  prefs,
  open,
  onClose,
}: BookingEditorProps): ReactNode {
  const setup = useEditorSetup(person, prefs);
  const [draft, setDraft] = useState(() =>
    draftOf(page, { availability: setup.working, collectionId: setup.calendars[0]?.id ?? null }),
  );
  const [touched, setTouched] = useState(false);
  const { saving, save } = useSave(person, page, onClose);
  const onChange = (edit: DraftEdit): void => {
    setTouched(true);
    setDraft((current) => ({ ...current, ...edit }));
  };
  const titleError = touched && draftProblemOf(draft) === 'title' ? 'Give the page a name' : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={page === null ? 'New booking page' : 'Edit booking page'}
      detents={['full']}
      wide
      footer={
        <EditorFooter
          draft={draft}
          page={page}
          saving={saving}
          onCancel={onClose}
          onSave={() => {
            save(draft);
          }}
        />
      }
    >
      <View className="pb-4 pt-2">
        <BookingFields {...setup} draft={draft} titleError={titleError} onChange={onChange} />
      </View>
    </Sheet>
  );
}
