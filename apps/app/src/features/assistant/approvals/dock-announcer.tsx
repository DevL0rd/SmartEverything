import { useState, type ReactNode } from 'react';
import { Text } from 'react-native';
import { useIdiom } from '../../../design/platform';
import { announcementOf, newRequestIds } from './needs-you-model';

export interface AnnouncedRequest {
  readonly id: string;
  readonly needs: string;
}

interface Heard {
  readonly seen: ReadonlySet<string>;
  readonly spoken: string;
}

export function DockAnnouncer({
  requests,
}: {
  readonly requests: readonly AnnouncedRequest[];
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const [heard, setHeard] = useState<Heard>({ seen: new Set(), spoken: '' });
  const ids = requests.map((request) => request.id);
  const fresh = newRequestIds(heard.seen, ids);
  if (fresh.length > 0 || ids.length !== heard.seen.size) {
    const newest = requests.find((request) => request.id === fresh.at(-1));
    setHeard({
      seen: new Set(ids),
      spoken: newest === undefined ? heard.spoken : announcementOf(newest.needs, touch),
    });
  }
  return (
    <Text
      accessibilityLiveRegion="polite"
      aria-live="polite"
      className="absolute size-px opacity-0"
    >
      {heard.spoken}
    </Text>
  );
}
