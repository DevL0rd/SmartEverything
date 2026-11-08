import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

export function ActivityAnnouncement({
  status,
  text,
  announceOnMount = false,
}: {
  readonly status: string;
  readonly text: string;
  readonly announceOnMount?: boolean;
}): ReactNode {
  const previous = useRef<string | null>(announceOnMount ? null : status);
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    setSpoken(() => text);
  }, [status, text]);
  return (
    <Text
      role="status"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      aria-atomic
      className="absolute size-px overflow-hidden opacity-0"
    >
      {spoken}
    </Text>
  );
}
