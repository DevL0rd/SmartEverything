import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TranscriptDetail, TranscriptLine } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { shortClock } from '../../../format/time';
import { useSettings } from '../../../store/selectors';
import { useTranscript, useTranscriptActions } from '../data/use-transcripts';

function Line({ line }: { readonly line: TranscriptLine }): ReactNode {
  const { time_zone: timeZone } = useSettings();
  return (
    <View className="gap-0.5 py-2">
      <Text variant="footnote" tone="variant">
        {`${line.speaker} · ${shortClock(line.at, timeZone)}`}
      </Text>
      <Text variant="body" selectable>
        {line.text}
      </Text>
    </View>
  );
}

function Lines({ detail }: { readonly detail: TranscriptDetail }): ReactNode {
  if (detail.lines.length === 0) {
    return (
      <EmptyState
        icon="fileText"
        title="Nothing said yet"
        body="Lines show up here as they come."
      />
    );
  }
  return (
    <View>
      {detail.lines.map((line) => (
        <Line key={line.id} line={line} />
      ))}
      {detail.more ? (
        <Text variant="footnote" tone="variant" className="py-3">
          This transcript is longer than the page shows.
        </Text>
      ) : null}
    </View>
  );
}

function useRemoval(sessionId: string, onClose: () => void): () => void {
  const actions = useTranscriptActions();
  return (): void => {
    void (async (): Promise<void> => {
      const accepted = await confirm({
        title: 'Delete this transcript?',
        body: 'All its lines are removed for good.',
        confirmLabel: 'Delete',
        tone: 'destructive',
      });
      if (!accepted) {
        return;
      }
      try {
        await actions.remove(sessionId);
        onClose();
      } catch (error) {
        notify({ message: 'The transcript wasn’t deleted', error, tone: 'critical' });
      }
    })();
  };
}

export function TranscriptSheet({
  sessionId,
  onClose,
}: {
  readonly sessionId: string;
  readonly onClose: () => void;
}): ReactNode {
  const detail = useTranscript(sessionId);
  const remove = useRemoval(sessionId, onClose);
  return (
    <Sheet
      open
      onClose={onClose}
      title={detail.data?.session.title ?? 'Transcript'}
      detents={['half', 'full']}
      footer={<Button label="Delete transcript" icon="trash" variant="outlined" onPress={remove} />}
    >
      {detail.isError ? (
        <ErrorState error={detail.error} retry={() => void detail.refetch()} />
      ) : detail.data === undefined ? (
        <Skeleton shape="block" className="h-40" />
      ) : (
        <Lines detail={detail.data} />
      )}
    </Sheet>
  );
}
