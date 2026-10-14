import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { Banner } from '../../../components/banner';
import { useSyncStatus } from '../../../store/selectors';
import { friendlyError } from '../../../format/errors';
import { useHarnessSupportReason } from '../data/harness';

export function ExtensionReadStatus({
  loading,
  error,
  retry,
  kind = 'extension',
}: {
  readonly loading: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
  readonly kind?: 'extension' | 'skill';
}): ReactNode {
  const sync = useSyncStatus();
  const reason = useHarnessSupportReason();
  if (sync.status !== 'live')
    return (
      <Banner
        tone="warning"
        title="Offline · showing last known status"
        body="Reconnect to the home hub before changing the shared selection."
      />
    );
  if (reason !== null)
    return (
      <Banner
        tone="warning"
        title={kind === 'skill' ? 'Skills unavailable' : 'Extensions unavailable'}
        body={reason}
        wrapBody
      />
    );
  if (error !== null)
    return (
      <Banner
        tone="warning"
        title={kind === 'skill' ? 'Couldn’t read skills' : 'Couldn’t read extensions'}
        body={friendlyError(error) ?? 'The catalogue is not available yet.'}
        action={{ label: 'Retry', onPress: retry }}
      />
    );
  return loading ? (
    <ActivityIndicator
      colorClassName="accent-primary"
      accessibilityLabel={kind === 'skill' ? 'Loading skills' : 'Loading extensions'}
    />
  ) : null;
}
