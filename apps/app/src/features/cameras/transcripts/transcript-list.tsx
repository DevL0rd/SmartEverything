import type { ReactNode } from 'react';
import { useState } from 'react';
import type { TranscriptHit, TranscriptSession } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { longDate, shortClock } from '../../../format/time';
import { useSettings } from '../../../store/selectors';
import { useTranscriptSearch, useTranscripts } from '../data/use-transcripts';
import { sessionSubtitle } from './transcript-model';
import { TranscriptSheet } from './transcript-sheet';

const SEARCH_DELAY_MS = 300;

function when(moment: string, timeZone: string): string {
  return `${longDate(moment, timeZone)}, ${shortClock(moment, timeZone)}`;
}

function isLive(session: TranscriptSession): boolean {
  return session.source === 'plugin' && session.ended_at === null;
}

function SessionRow({
  session,
  open,
}: {
  readonly session: TranscriptSession;
  readonly open: (id: string) => void;
}): ReactNode {
  const { time_zone: timeZone } = useSettings();
  const live = isLive(session);
  return (
    <ListRow
      title={session.title}
      subtitle={sessionSubtitle(
        session,
        when(session.last_line_at ?? session.started_at, timeZone),
      )}
      icon={session.source === 'camera' ? 'mic' : 'messageCircle'}
      chevron
      {...(live ? { trailing: <Badge label="Live" tone="primary" /> } : {})}
      onPress={() => {
        open(session.id);
      }}
    />
  );
}

function SessionList({
  title,
  sessions,
  open,
}: {
  readonly title: string;
  readonly sessions: readonly TranscriptSession[];
  readonly open: (id: string) => void;
}): ReactNode {
  if (sessions.length === 0) {
    return null;
  }
  return (
    <List title={title} inset>
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} open={open} />
      ))}
    </List>
  );
}

function Sessions({ open }: { readonly open: (id: string) => void }): ReactNode {
  const sessions = useTranscripts();
  if (sessions.isError) {
    return <ErrorState error={sessions.error} retry={() => void sessions.refetch()} />;
  }
  if (sessions.data === undefined) {
    return <Skeleton shape="block" className="h-40" />;
  }
  const shown = sessions.data.filter((session) => session.line_count > 0 || isLive(session));
  if (shown.length === 0) {
    return (
      <EmptyState
        icon="fileText"
        title="No transcripts yet"
        body="Turn on Transcribe what it hears in a camera’s options, or let a plugin keep one."
      />
    );
  }
  return (
    <>
      <SessionList
        title="Camera transcripts"
        sessions={shown.filter((session) => session.source === 'camera')}
        open={open}
      />
      <SessionList
        title="Call transcripts"
        sessions={shown.filter((session) => session.source === 'plugin')}
        open={open}
      />
    </>
  );
}

function hitSubtitle(hit: TranscriptHit): string {
  const { speaker } = hit.line;
  const { title } = hit.session;
  return title.startsWith(speaker) ? title : `${speaker} · ${title}`;
}

function HitRow({
  hit,
  open,
}: {
  readonly hit: TranscriptHit;
  readonly open: (id: string) => void;
}): ReactNode {
  return (
    <ListRow
      title={hit.line.text}
      subtitle={hitSubtitle(hit)}
      icon="search"
      chevron
      onPress={() => {
        open(hit.session.id);
      }}
    />
  );
}

function Found({
  words,
  open,
}: {
  readonly words: string;
  readonly open: (id: string) => void;
}): ReactNode {
  const hits = useTranscriptSearch(words);
  if (hits.isError) {
    return <ErrorState error={hits.error} retry={() => void hits.refetch()} />;
  }
  if (hits.data === undefined) {
    return <Skeleton shape="block" className="h-40" />;
  }
  if (hits.data.length === 0) {
    return <EmptyState icon="search" title="Nothing found" body={`No line mentions “${words}”.`} />;
  }
  return (
    <List title="Lines found" inset>
      {hits.data.map((hit) => (
        <HitRow key={hit.line.id} hit={hit} open={open} />
      ))}
    </List>
  );
}

export function TranscriptList(): ReactNode {
  const [words, setWords] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const settled = useDebouncedValue(words.trim(), SEARCH_DELAY_MS);
  return (
    <>
      <SearchField
        value={words}
        onChange={setWords}
        placeholder="Search what was said"
        variant="field"
      />
      {settled === '' ? <Sessions open={setOpened} /> : <Found words={settled} open={setOpened} />}
      {opened === null ? null : (
        <TranscriptSheet
          sessionId={opened}
          onClose={() => {
            setOpened(null);
          }}
        />
      )}
    </>
  );
}
