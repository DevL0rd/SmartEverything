import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { useMutationState } from '../../../../store/mutation';
import { editPhotoMeta } from '../api';
import { itemsText } from '../actions';
import { DateSection } from './date-section';
import { LocationSection } from './location-section';
import {
  metaPatchOf,
  momentText,
  offsetOfZone,
  savedText,
  wallOf,
  type DateDraft,
  type LocationDraft,
  type WallDraft,
} from './meta-model';
import { closeMetaEdit, useMetaRequest, type MetaRequest } from './meta-request';

interface Draft {
  readonly date: DateDraft;
  readonly location: LocationDraft;
}

const UNCHANGED: Draft = { date: { kind: 'keep' }, location: { kind: 'keep' } };

function deviceOffset(at: number): number {
  return -new Date(at).getTimezoneOffset();
}

export function startWallOf(request: MetaRequest, now: number): WallDraft {
  const takenAt = request.current?.takenAt ?? null;
  if (takenAt === null) return wallOf(new Date(now).toISOString(), deviceOffset(now));
  return wallOf(takenAt, request.current?.offsetMin ?? deviceOffset(Date.parse(takenAt)));
}

function zoned(draft: Draft, timeZone: string): Draft {
  if (draft.date.kind !== 'set') return draft;
  const { wall } = draft.date;
  const offset = offsetOfZone(timeZone, Date.parse(momentText(wall)));
  if (offset === null) return draft;
  return { ...draft, date: { kind: 'set', wall: { ...wall, offsetMin: offset } } };
}

function Heading({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="title-3">{title}</Text>
      <Text variant="footnote" tone="variant">
        {detail}
      </Text>
    </View>
  );
}

function Body({
  request,
  draft,
  onDraft,
}: {
  readonly request: MetaRequest;
  readonly draft: Draft;
  readonly onDraft: (update: (draft: Draft) => Draft) => void;
}): ReactNode {
  const [start] = useState(() => startWallOf(request, Date.now()));
  const many = request.itemIds.length > 1;
  return (
    <View className="gap-6 pb-2">
      <View className="gap-3">
        <Heading
          title="Date and time"
          detail={
            many
              ? 'Set one date for all of them, or shift each by the same amount.'
              : 'The file stays untouched; Photos keeps the new date.'
          }
        />
        <DateSection
          draft={draft.date}
          start={start}
          shiftable={many}
          onDraft={(date) => {
            onDraft((before) => ({ ...before, date }));
          }}
        />
      </View>
      <View className="gap-3">
        <Heading title="Location" detail="Search for a place or tap the map." />
        <LocationSection
          current={many ? null : request.current}
          draft={draft.location}
          onDraft={(location) => {
            onDraft((before) => ({ ...before, location }));
          }}
          onZone={(timeZone) => {
            onDraft((before) => zoned(before, timeZone));
          }}
        />
      </View>
    </View>
  );
}

function Footer({
  request,
  draft,
}: {
  readonly request: MetaRequest;
  readonly draft: Draft;
}): ReactNode {
  const mutation = useMutationState();
  const patch = metaPatchOf(request.itemIds, draft.date, draft.location);
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      <Button label="Cancel" variant="text" onPress={closeMetaEdit} />
      <Button
        label="Save"
        loading={mutation.busy}
        disabled={patch === null}
        onPress={() => {
          if (patch === null) return;
          mutation.run(() => editPhotoMeta(patch), {
            failure: 'The date and location were not saved',
            label: 'photos.organise.meta',
            onDone: (changed) => {
              notify({ message: savedText(changed.count) });
              closeMetaEdit();
              request.onSaved?.();
            },
          });
        }}
      />
    </View>
  );
}

export function MetaEditHost(): ReactNode {
  const request = useMetaRequest();
  const [seen, setSeen] = useState(request);
  const [draft, setDraft] = useState<Draft>(UNCHANGED);
  if (seen !== request) {
    setSeen(request);
    setDraft(UNCHANGED);
  }
  return (
    <Sheet
      open={request !== null}
      onClose={closeMetaEdit}
      title={
        request === null || request.itemIds.length === 1
          ? 'Edit date and location'
          : `Edit ${itemsText(request.itemIds.length)}`
      }
      kind="inspector"
      detents={['full']}
      scroll
      footer={request === null ? null : <Footer request={request} draft={draft} />}
    >
      {request === null ? null : (
        <Body key={request.itemIds.join()} request={request} draft={draft} onDraft={setDraft} />
      )}
    </Sheet>
  );
}
