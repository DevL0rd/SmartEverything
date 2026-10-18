import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { announcementOf, type Announcement } from '../model/reply-announcement';

const SILENT: Announcement = { text: '', urgent: false };

export function StatusAnnouncer({ row }: { readonly row: AssistantMessageRow | null }): ReactNode {
  const [spoken, setSpoken] = useState(SILENT);
  const key = row === null ? null : `${row.id}:${String(row.state)}`;
  const previous = useRef<string | null>(key);
  useEffect(() => {
    if (row === null || key === previous.current) {
      return;
    }
    previous.current = key;
    setSpoken(announcementOf(row) ?? SILENT);
  }, [row, key]);
  return (
    <>
      <Text
        accessibilityLiveRegion="polite"
        aria-live="polite"
        className="absolute size-px opacity-0"
      >
        {spoken.urgent ? '' : spoken.text}
      </Text>
      <Text
        accessibilityLiveRegion="assertive"
        aria-live="assertive"
        className="absolute size-px opacity-0"
      >
        {spoken.urgent ? spoken.text : ''}
      </Text>
    </>
  );
}
