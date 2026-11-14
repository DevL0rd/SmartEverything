import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import type { StatusTone } from '../../../components/tone';
import type { LocalLibraryState } from '../local/types';
import type { LocalLibraryView } from '../local/use-local-library';

interface LocalStatus {
  readonly title: string;
  readonly body: string;
  readonly tone: StatusTone;
  readonly action: 'access' | 'retry' | null;
}

export function localLibraryStatusOf(library: LocalLibraryState): LocalStatus | null {
  if (library.state === 'unavailable') return null;
  if (library.state === 'loading')
    return {
      title: 'Loading photos and videos on this device',
      body: 'Your local library appears here without turning on backup.',
      tone: 'info',
      action: null,
    };
  if (library.state === 'denied')
    return {
      title: 'Show photos and videos on this device',
      body: 'Allow access to browse your local library. This does not turn on backup.',
      tone: 'info',
      action: 'access',
    };
  if (library.error !== null)
    return {
      title:
        library.items.length === 0
          ? 'Local photos could not be loaded'
          : 'Some local photos could not be loaded',
      body: library.error,
      tone: 'warning',
      action: 'retry',
    };
  if (library.access === 'limited')
    return {
      title: 'Showing selected photos and videos',
      body: 'Choose more photos and videos to show in your local library. Backup is optional.',
      tone: 'info',
      action: 'access',
    };
  return null;
}

export function LocalLibraryStatus({ library }: { readonly library: LocalLibraryView }): ReactNode {
  const status = localLibraryStatusOf(library);
  if (status === null) return null;
  const action =
    status.action === null
      ? undefined
      : {
          label:
            status.action === 'retry'
              ? 'Try again'
              : library.access === 'limited'
                ? 'Choose photos'
                : 'Allow access',
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
