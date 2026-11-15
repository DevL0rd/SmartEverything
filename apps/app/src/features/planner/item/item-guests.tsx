import type {
  PlannerGuestEntry,
  PlannerGuestRow,
  PlannerGuestSuggestion,
  PlannerItemRow,
  ProfileRow,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { copyText } from '../../../components/copy-button';
import { FilterChip } from '../../../components/filter-chip';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { useRows } from '../../../store/selectors';
import type { PlannerPerson } from '../data';
import { usePlannerProfile } from '../data/assignment';
import { useGuestSuggestions, useGuestWrites, useItemGuests } from '../data/guests';
import { GuestRow } from './guest-row';
import {
  countsTextOf,
  emailEntryOf,
  entriesOf,
  guestViewsOf,
  inviteeChoicesOf,
  responseCountsOf,
  shownSuggestionsOf,
  toggledPerson,
  withGuest,
  withoutGuest,
  type GuestView,
  type ResponseCounts,
} from './guests-model';
import { reported } from './item-actions';

const SEGMENTS = [
  ['yes', 'bg-positive'],
  ['maybe', 'bg-warning'],
  ['no', 'bg-critical'],
  ['waiting', 'bg-surface-3'],
] as const;

function ResponseBar({ counts }: { readonly counts: ResponseCounts }): ReactNode {
  const cells = SEGMENTS.flatMap(([key, colour]) =>
    Array.from({ length: counts[key] }, (_, index) => ({ key: `${key}:${String(index)}`, colour })),
  );
  if (cells.length === 0) return null;
  return (
    <View aria-hidden className="mx-4 h-1.5 flex-row gap-0.5">
      {cells.map((cell) => (
        <View key={cell.key} className={cn('h-full min-w-1 flex-1 rounded-full', cell.colour)} />
      ))}
    </View>
  );
}

interface GuestEditor {
  readonly entries: readonly PlannerGuestEntry[];
  readonly busy: boolean;
  readonly save: (next: readonly PlannerGuestEntry[]) => void;
  readonly resend: (view: GuestView) => void;
  readonly copyLink: (view: GuestView) => void;
}

function useGuestEditor(
  itemId: string,
  person: PlannerPerson,
  rows: ReturnType<typeof useItemGuests>,
): GuestEditor {
  const writes = useGuestWrites(person);
  const [busy, setBusy] = useState(false);
  const entries = entriesOf(rows);
  return {
    entries,
    busy,
    save: (next): void => {
      setBusy(true);
      reported(
        writes.setGuests(itemId, next).finally(() => {
          setBusy(false);
        }),
        'Couldn’t change the guests',
      );
    },
    resend: (view): void => {
      reported(writes.resend(view.row), `Couldn’t send the invitation to ${view.name}`);
    },
    copyLink: (view): void => {
      reported(
        writes.inviteLink(view.row).then((url) => {
          copyText(url, 'Invite link');
        }),
        `Couldn’t get the invite link of ${view.name}`,
      );
    },
  };
}

function PeopleChips({
  people,
  editor,
  disabled,
}: {
  readonly people: readonly ProfileRow[];
  readonly editor: GuestEditor;
  readonly disabled: boolean;
}): ReactNode {
  if (people.length === 0) return null;
  const invited = new Set(
    editor.entries.flatMap((entry) => (entry.kind === 'person' ? [entry.profile_id] : [])),
  );
  return (
    <View accessibilityLabel="People in the home" className="flex-row flex-wrap gap-2 px-4">
      {people.map((profile) => (
        <FilterChip
          key={profile.id}
          label="Invite"
          value={profile.name}
          icon="user"
          active={invited.has(profile.id)}
          disabled={disabled}
          onPress={() => {
            editor.save(toggledPerson(editor.entries, profile.id));
          }}
        />
      ))}
    </View>
  );
}

function Suggestions({
  shown,
  disabled,
  onPick,
}: {
  readonly shown: readonly PlannerGuestSuggestion[];
  readonly disabled: boolean;
  readonly onPick: (suggestion: PlannerGuestSuggestion) => void;
}): ReactNode {
  if (shown.length === 0) return null;
  return (
    <View accessibilityLabel="People you invited before" className="flex-row flex-wrap gap-2">
      {shown.map((suggestion) => (
        <FilterChip
          key={suggestion.email}
          label="Invite"
          value={suggestion.name ?? suggestion.email}
          icon="atSign"
          active={false}
          disabled={disabled}
          onPress={() => {
            onPick(suggestion);
          }}
        />
      ))}
    </View>
  );
}

function EmailEntry({
  person,
  editor,
  disabled,
}: {
  readonly person: PlannerPerson;
  readonly editor: GuestEditor;
  readonly disabled: boolean;
}): ReactNode {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const suggestions = useGuestSuggestions(person, text).data ?? [];
  const entry = emailEntryOf(text);
  const add = (next: PlannerGuestEntry | null): void => {
    setInvalid(next === null);
    if (next === null) return;
    editor.save(withGuest(editor.entries, next));
    setText('');
  };
  return (
    <View className="gap-2 px-4">
      <TextField
        label="Invite by email"
        kind="email"
        value={text}
        onChange={(value) => {
          setText(value);
          setInvalid(false);
        }}
        onSubmit={() => {
          if (text.trim() !== '') add(entry);
        }}
        placeholder="name@example.com"
        disabled={disabled}
        error={invalid ? 'That isn’t an email address' : null}
        showLabel={false}
      />
      <Suggestions
        shown={shownSuggestionsOf(suggestions, editor.entries)}
        disabled={disabled}
        onPick={(suggestion) => {
          add({ kind: 'email', email: suggestion.email, name: suggestion.name });
        }}
      />
    </View>
  );
}

export interface ItemGuestsProps {
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}

function GuestList({
  rows,
  profiles,
  editor,
  organiser,
  disabled,
}: {
  readonly rows: readonly PlannerGuestRow[];
  readonly profiles: readonly ProfileRow[];
  readonly editor: GuestEditor;
  readonly organiser: boolean;
  readonly disabled: boolean;
}): ReactNode {
  const remove = (removed: GuestView): void => {
    editor.save(withoutGuest(editor.entries, removed.key));
  };
  return (
    <View>
      {guestViewsOf(rows, profiles).map((view) => (
        <GuestRow
          key={view.key}
          view={view}
          disabled={disabled}
          onRemove={organiser ? remove : null}
          onResend={organiser ? editor.resend : null}
          onCopyLink={organiser ? editor.copyLink : null}
        />
      ))}
    </View>
  );
}

function OrganiserTools({
  item,
  person,
  profiles,
  editor,
  disabled,
}: {
  readonly item: PlannerItemRow;
  readonly person: PlannerPerson;
  readonly profiles: readonly ProfileRow[];
  readonly editor: GuestEditor;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <>
      <PeopleChips
        people={inviteeChoicesOf(profiles, item.profile_id)}
        editor={editor}
        disabled={disabled}
      />
      <EmailEntry person={person} editor={editor} disabled={disabled} />
    </>
  );
}

export function ItemGuests({ item, person, disabled }: ItemGuestsProps): ReactNode {
  const masterId = item.series_id ?? item.id;
  const rows = useItemGuests(masterId);
  const profiles = useRows('profiles');
  const me = usePlannerProfile(person);
  const editor = useGuestEditor(masterId, person, rows);
  const organiser = item.profile_id === me && item.kind === 'event';
  if (!organiser && rows.length === 0) return null;
  const counts = responseCountsOf(rows);
  const caption = countsTextOf(counts);
  const locked = disabled || editor.busy;
  const emailed = organiser && rows.some((row) => row.kind === 'email');
  return (
    <Section title="Guests" {...(caption === null ? {} : { caption })}>
      <View className="gap-3">
        <ResponseBar counts={counts} />
        {organiser ? (
          <OrganiserTools
            item={item}
            person={person}
            profiles={profiles}
            editor={editor}
            disabled={locked}
          />
        ) : null}
        <GuestList
          rows={rows}
          profiles={profiles}
          editor={editor}
          organiser={organiser}
          disabled={locked}
        />
        {emailed ? (
          <Text variant="footnote" tone="variant" className="px-4">
            Guests answer from the links in the invitation; replies to the email are not read.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}
