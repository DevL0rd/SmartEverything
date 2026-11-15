import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import type { StatusTone } from '../../../components/tone';
import type { LocalLibraryState } from '../local/types';
import type { LocalLibraryView } from '../local/use-local-library';

export interface LocalCopy {
  readonly title: string;
  readonly body: string;
  readonly label: string | null;
}

export const LOCAL_COPY = {
  loading: {
    title: 'Loading photos and videos on this device',
    body: 'They appear here without turning on backup.',
    label: null,
  },
  ask: {
    title: 'Show photos and videos on this device',
    body: 'Allow access to browse this device’s photos and videos here. This does not turn on backup.',
    label: 'Allow access',
  },
  settings: {
    title: 'Photo access is off',
    body: 'Turn on photo and video access for SmartEverything in the system settings to see this device’s library.',
    label: 'Open system settings',
  },
  failed: {
    title: 'Photos on this device did not load',
    body: '',
    label: 'Try again',
  },
  partial: {
    title: 'Some photos on this device did not load',
    body: '',
    label: 'Try again',
  },
  limited: {
    title: 'Showing the photos and videos you chose',
    body: 'Choose more to see them here. Backup is optional.',
    label: 'Choose more',
  },
} as const satisfies Readonly<Record<string, LocalCopy>>;

export interface LocalStatus extends LocalCopy {
  readonly tone: StatusTone;
  readonly action: 'access' | 'retry' | null;
}

export function localLibraryStatusOf(library: LocalLibraryState): LocalStatus | null {
  if (library.state === 'unavailable') return null;
  if (library.state === 'loading') return { ...LOCAL_COPY.loading, tone: 'info', action: null };
  if (library.state === 'denied') return { ...LOCAL_COPY.ask, tone: 'info', action: 'access' };
  if (library.error !== null) {
    const copy = library.items.length === 0 ? LOCAL_COPY.failed : LOCAL_COPY.partial;
    return { ...copy, body: library.error, tone: 'warning', action: 'retry' };
  }
  if (library.access === 'limited') {
    return { ...LOCAL_COPY.limited, tone: 'info', action: 'access' };
  }
  return null;
}

export function LocalLibraryStatus({ library }: { readonly library: LocalLibraryView }): ReactNode {
  const status = localLibraryStatusOf(library);
  if (status === null) return null;
  const { label } = status;
  const action =
    label === null
      ? undefined
      : {
          label,
          onPress: (): void => {
            if (status.action === 'retry') library.retry();
            else background(library.requestAccess(), 'photos.local.access_failed');
          },
        };
  return (
    <Banner
      tone={status.tone}
      title={status.title}
      body={status.body}
      wrapBody
      {...(action === undefined ? {} : { action })}
    />
  );
}
