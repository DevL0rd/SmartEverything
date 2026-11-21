import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { setDriveGrant } from '../../../api/drive';
import { Button } from '../../../components/button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { errorFields } from '../../../design/log-tally';
import { notify } from '../../../components/toast-store';
import { ProfileAvatar } from '../../profiles';
import type { CommentContext } from './comment-context';
import {
  canPost,
  mentionQueryOf,
  mentionsIn,
  suggestionsOf,
  unsharedMentionsOf,
  withMention,
} from './comments-model';

const log = new Logger('app.drive');

function Suggestions({
  body,
  context,
  onChange,
}: {
  readonly body: string;
  readonly context: CommentContext;
  readonly onChange: (body: string) => void;
}): ReactNode {
  const query = mentionQueryOf(body);
  const people = query === null ? [] : suggestionsOf(query, context.people, context.viewerId);
  if (people.length === 0) return null;
  return (
    <View
      role="list"
      aria-label="People to mention"
      className="overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-raised"
    >
      {people.map((person, index) => (
        <Interactive
          key={person.id}
          role="button"
          label={`Mention ${person.name}`}
          onPress={() => {
            onChange(withMention(body, person));
          }}
          className={cn(
            'min-h-touch-min flex-row items-center gap-3 px-3 py-1.5',
            index === 0 ? '' : 'border-t border-outline-variant',
          )}
        >
          <ProfileAvatar profile={person} />
          <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
            {person.name}
          </Text>
          {context.sees !== null && !context.sees(person.id) ? (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              No access yet
            </Text>
          ) : null}
        </Interactive>
      ))}
    </View>
  );
}

export interface ComposerProps {
  readonly context: CommentContext;
  readonly label: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly initial: string;
  readonly focus: boolean;
  readonly send: (body: string, mentions: readonly string[]) => Promise<unknown>;
  readonly onCancel: (() => void) | null;
  readonly onDone: () => void;
}

function unsharedLineOf(names: readonly string[]): string {
  const list =
    names.length === 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
  return `${list} cannot open this yet. Sharing gives view access first.`;
}

interface Posting {
  readonly body: string;
  readonly setBody: (body: string) => void;
  readonly unshared: readonly string[];
  readonly busy: boolean;
  readonly post: () => void;
}

function shareFirst(itemId: string, unshared: readonly string[]): Promise<unknown> {
  return Promise.all(
    unshared.map((profileId) =>
      setDriveGrant({ itemId, profileId, role: 'view', expiresAt: null }),
    ),
  );
}

function usePosting(props: ComposerProps): Posting {
  const { context } = props;
  const [body, setBody] = useState(props.initial);
  const [pending, setPending] = useState(0);
  const mentions = mentionsIn(body, context.people);
  const unshared = context.sees === null ? [] : unsharedMentionsOf(mentions, context.sees);
  const itemId = context.subject.item.id;
  const post = (): void => {
    const sent = body;
    setPending((current) => current + 1);
    setBody('');
    props.onDone();
    const done = shareFirst(itemId, unshared)
      .then(() => props.send(sent.trim(), mentions))
      .then(
        () => {
          log.info('comment.posted', { itemId });
        },
        (error: unknown) => {
          log.warn('comment.post_refused', { itemId, ...errorFields(error) });
          setBody(sent);
          notify({ message: 'The comment was not saved', error, tone: 'critical' });
        },
      )
      .finally(() => {
        setPending((current) => current - 1);
      });
    background(done, 'drive.comment.post_settle_failed');
  };
  return { body, setBody, unshared, busy: pending > 0, post };
}

function Actions({
  writable,
  submitLabel,
  onCancel,
  posting,
}: {
  readonly writable: boolean;
  readonly submitLabel: string;
  readonly onCancel: (() => void) | null;
  readonly posting: Posting;
}): ReactNode {
  const sharing = posting.unshared.length > 0;
  const ready = canPost(posting.body, posting.busy) && writable;
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-2">
      {onCancel === null ? null : <Button label="Cancel" variant="text" onPress={onCancel} />}
      <Button
        label={sharing ? 'Share and mention' : submitLabel}
        icon={sharing ? 'share' : 'messageCircle'}
        disabled={!ready}
        onPress={posting.post}
      />
    </View>
  );
}

export function Composer(props: ComposerProps): ReactNode {
  const { context } = props;
  const posting = usePosting(props);
  const names = posting.unshared.map((profileId) => context.nameOf(profileId) ?? 'Someone');
  return (
    <View className="gap-2">
      <TextField
        label={props.label}
        showLabel={false}
        value={posting.body}
        onChange={posting.setBody}
        placeholder={props.placeholder}
        multiline
        focusOnMount={props.focus}
        disabled={!context.writable}
      />
      <Suggestions body={posting.body} context={context} onChange={posting.setBody} />
      {names.length === 0 ? null : (
        <Text variant="footnote" tone="variant">
          {unsharedLineOf(names)}
        </Text>
      )}
      <Actions
        writable={context.writable}
        submitLabel={props.submitLabel}
        onCancel={props.onCancel}
        posting={posting}
      />
    </View>
  );
}
