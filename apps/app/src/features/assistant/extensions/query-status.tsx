import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Skeleton } from '../../../components/skeleton';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { friendlyError } from '../../../format/errors';

const PLACEHOLDER_ROWS = ['first', 'second', 'third'] as const;

function LoadingRows({ label }: { readonly label: string }): ReactNode {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" className="gap-4 py-2">
      {PLACEHOLDER_ROWS.map((row) => (
        <View key={row} className="flex-row items-center gap-3">
          <Skeleton shape="circle" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" />
            <Skeleton shape="line" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function useMemberBanner(change: string): ReactNode | undefined {
  const owner = useIsOwner();
  return owner ? undefined : (
    <Banner
      tone="info"
      title="You can look, not change"
      body={`Only the home owner can ${change}.`}
      wrapBody
    />
  );
}

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
  const noun = kind === 'skill' ? 'skills' : 'extensions';
  if (sync.status !== 'live')
    return (
      <Banner
        tone="info"
        title="Offline · showing last known status"
        body="Changes, updates and the catalogue need your home hub."
        wrapBody
      />
    );
  if (error !== null)
    return (
      <Banner
        tone="critical"
        title={`Couldn’t load ${noun}`}
        body={
          friendlyError(error) ?? 'Home hub didn’t answer. Check your connection and try again.'
        }
        action={{ label: 'Try again', onPress: retry }}
        wrapBody
      />
    );
  return loading ? <LoadingRows label={`Loading ${noun}`} /> : null;
}
