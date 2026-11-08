import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useValue } from '../../../design/external-store';
import { useChatMessages } from '../data/chat-store';
import { historySynchronization } from '../data/history';
import {
  replyAnnouncements,
  type Announcement,
  type AnnouncementFrame,
} from '../model/reply-announcement';

interface Speech {
  readonly polite: string;
  readonly assertive: string;
}

const SILENT: Speech = { polite: '', assertive: '' };

function speechOf(batch: readonly Announcement[]): Speech {
  const polite: string[] = [];
  const assertive: string[] = [];
  for (const { urgent, text } of batch) (urgent ? assertive : polite).push(text);
  return { polite: polite.join('\n'), assertive: assertive.join('\n') };
}

function LiveRegion({
  priority,
  text,
}: {
  readonly priority: keyof Speech;
  readonly text: string;
}): ReactNode {
  return (
    <Text
      accessibilityLiveRegion={priority}
      aria-live={priority}
      className="absolute size-px opacity-0"
    >
      {text}
    </Text>
  );
}

export function StatusAnnouncer({ chatId }: { readonly chatId: string }): ReactNode {
  const rows = useChatMessages(chatId);
  const revision = useValue(historySynchronization);
  const previous = useRef<AnnouncementFrame | null>(null);
  const [spoken, setSpoken] = useState({ alternate: false, speech: SILENT });
  useEffect(() => {
    const prior = previous.current;
    const current = { rows, revision };
    previous.current = current;
    const batch = replyAnnouncements(prior, current);
    if (batch.length > 0) {
      const speech = speechOf(batch);
      setSpoken((last) => ({ alternate: !last.alternate, speech }));
    } else if (prior !== null && prior.revision !== revision) {
      setSpoken((last) => ({ ...last, speech: SILENT }));
    }
  }, [rows, revision]);
  const first = spoken.alternate ? SILENT : spoken.speech;
  const second = spoken.alternate ? spoken.speech : SILENT;
  return (
    <>
      <LiveRegion priority="polite" text={first.polite} />
      <LiveRegion priority="assertive" text={first.assertive} />
      <LiveRegion priority="polite" text={second.polite} />
      <LiveRegion priority="assertive" text={second.assertive} />
    </>
  );
}
