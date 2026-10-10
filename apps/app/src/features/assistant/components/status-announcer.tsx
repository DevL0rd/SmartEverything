import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { noticeOf } from '../model/turn-notice';

function messageOf(row: AssistantMessageRow): string | null {
  switch (row.state) {
    case 'working':
      return `${row.author} is answering`;
    case 'answered':
      return `${row.author} answered`;
    case 'failed':
      return `Failed: ${noticeOf(row.reason_code, row.reason, 'reply').title}`;
    case 'queued':
    case 'delivered':
    case null:
      return null;
  }
}

export function StatusAnnouncer({ row }: { readonly row: AssistantMessageRow | null }): ReactNode {
  const [message, setMessage] = useState('');
  const previous = useRef<string | null>(row === null ? null : `${row.id}:${String(row.state)}`);
  const key = row === null ? null : `${row.id}:${String(row.state)}`;
  useEffect(() => {
    if (row === null || key === previous.current) {
      return;
    }
    previous.current = key;
    setMessage(messageOf(row) ?? '');
  }, [row, key]);
  return (
    <Text
      accessibilityLiveRegion="polite"
      aria-live="polite"
      className="absolute size-px opacity-0"
    >
      {message}
    </Text>
  );
}
