import type {
  PlannerGuestEntry,
  PlannerGuestRow,
  PlannerGuestSuggestion,
  PlannerItemRow,
  ProfileRow,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { List, Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { useRows } from '../../../store/selectors';
import type { PlannerPerson } from '../data';
import { usePlannerProfile } from '../data/assignment';
import { useGuestSuggestions, useGuestWrites, useItemGuests } from '../data/guests';
import { useGuestSaves } from '../data/item-saves';
import { GuestRow } from './guest-row';
import {
  countsTextOf,
  emailEntryOf,
  entriesOf,
  guestViewsOf,
  inviteeChoicesOf,
  responseCountsOf,
  shownSuggestionsOf,
  withGuest,
  withoutGuest,
  type GuestView,
  type ResponseCounts,
} from './guests-model';
import { reported } from './item-actions';
import { OutlinedChip } from './outlined-chip';

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
    <View aria-hidden className="h-1.5 flex-row gap-0.5">
      {cells.map((cell) => (
        <View key={cell.key} className={cn('h-full min-w-1 flex-1 rounded-full', cell.colour)} />
      ))}
    </View>
  );
}

interface GuestEditor {
  readonly entries: readonly PlannerGuestEntry[];
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
  const { unsaved, save } = useGuestSaves(person, itemId);
  return {
    entries: unsaved === null ? entriesOf(rows) : unsaved.entries,
    save: (next): void => {
      save({ entries: next });
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
  return (
    <View accessibilityLabel="People in the home" className="flex-row flex-wrap gap-2">
      {people.map((profile) => (
        <OutlinedChip
          key={profile.id}
          label={profile.name}
          spoken={`Invite ${profile.name}`}
          icon="user"
          trailing="plus"
          disabled={disabled}
          onPress={() => {
            editor.save(withGuest(editor.entries, { kind: 'person', profile_id: profile.id }));
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
        <OutlinedChip
          key={suggestion.email}
          label={suggestion.name ?? suggestion.email}
          spoken={`Invite ${suggestion.name ?? suggestion.email}`}
          icon="atSign"
          trailing="plus"
          disabled={disabled}
          onPress={() => {
            onPick(suggestion);
          }}
        />
      ))}
    </View>
  );
}

function useEmailEntry(
  person: PlannerPerson,
  editor: GuestEditor,
): {
  readonly text: string;
  readonly change: (value: string) => void;
  readonly invalid: boolean;
  readonly suggestions: readonly PlannerGuestSuggestion[];
  readonly add: (next: PlannerGuestEntry | null) => void;
  readonly submit: () => void;
} {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const suggestions = useGuestSuggestions(person, text).data ?? [];
  const add = (next: PlannerGuestEntry | null): void => {
    setInvalid(next === null);
    if (next === null) return;
    editor.save(withGuest(editor.entries, next));
    setText('');
  };
  return {
    text,
    change: (value): void => {
      setText(value);
      setInvalid(false);
    },
    invalid,
    suggestions,
    add,
    submit: (): void => {
      if (text.trim() !== '') add(emailEntryOf(text));
    },
  };
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
  const { text, change, invalid, suggestions, add, submit } = useEmailEntry(person, editor);
  return (
    <View className="gap-2">
      <TextField
        label="Invite by email"
        kind="email"
        value={text}
        onChange={change}
        onSubmit={submit}
        placeholder="name@example.com"
        disabled={disabled}
        error={invalid ? 'That isn’t an email address' : null}
        action={
          <Button
            label="Invite"
            variant="tonal"
            disabled={disabled || text.trim() === ''}
            onPress={submit}
          />
        }
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
  viewer,
  editor,
  organiser,
  disabled,
}: {
  readonly rows: readonly PlannerGuestRow[];
  readonly profiles: readonly ProfileRow[];
  readonly viewer: string | null;
  readonly editor: GuestEditor;
  readonly organiser: boolean;
  readonly disabled: boolean;
}): ReactNode {
  if (rows.length === 0) return null;
  const remove = (removed: GuestView): void => {
    editor.save(withoutGuest(editor.entries, removed.key));
  };
  return (
    <List>
      {guestViewsOf(rows, profiles, viewer).map((view) => (
        <GuestRow
          key={view.key}
          view={view}
          disabled={disabled}
          onRemove={organiser ? remove : null}
          onResend={organiser ? editor.resend : null}
          onCopyLink={organiser ? editor.copyLink : null}
        />
      ))}
    </List>
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
        people={inviteeChoicesOf(profiles, item.profile_id, editor.entries)}
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
  const emailed = organiser && rows.some((row) => row.kind === 'email');
  return (
    <Section title="Guests" {...(caption === null ? {} : { caption })}>
      <View className="gap-3">
        <ResponseBar counts={counts} />
        <GuestList
          rows={rows}
          profiles={profiles}
          viewer={me}
          editor={editor}
          organiser={organiser}
          disabled={disabled}
        />
        {organiser ? (
          <OrganiserTools
            item={item}
            person={person}
            profiles={profiles}
            editor={editor}
            disabled={disabled}
          />
        ) : null}
        {emailed ? (
          <Text variant="footnote" tone="variant">
            Guests answer from the links in the invitation; replies to the email are not read.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}
