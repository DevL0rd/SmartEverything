import type { ReactNode } from 'react';
import type { AndroidUpdateHistoryRow } from '@smarteverything/domain';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { shortDate } from '../../../format/time';
import { useAndroidUpdateHistory, type AndroidHistoryOffer } from '../data/android-update-history';

const WRAP = 'min-w-0 web:wrap-anywhere';

function OfferNotes({ notes }: { readonly notes: string | undefined }): ReactNode {
  if (notes === undefined)
    return <Text tone="variant">No changes were listed for this update.</Text>;
  return (
    <Text selectable className={WRAP}>
      {notes}
    </Text>
  );
}

function ReleaseRow({ release }: { readonly release: AndroidUpdateHistoryRow }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        {`Version ${release.appVersion} · ${shortDate(release.createdAt)}`}
      </Text>
      <Text selectable className={WRAP}>
        {release.notes.trim()}
      </Text>
    </View>
  );
}

export function AndroidUpdateHistory({
  notes,
  ...offer
}: AndroidHistoryOffer & { readonly notes: string | undefined }): ReactNode {
  const history = useAndroidUpdateHistory(offer);
  if (history === null) return <OfferNotes notes={notes} />;
  if (history.isPending)
    return (
      <Text tone="variant" accessibilityLiveRegion="polite">
        Loading the changes since your version…
      </Text>
    );
  if (history.isError)
    return (
      <View className="items-start gap-2">
        <Text tone="variant" accessibilityLiveRegion="polite">
          The changes since your version couldn’t be loaded.
        </Text>
        <Button
          label="Retry"
          icon="refresh"
          variant="outlined"
          onPress={(): void => {
            background(history.refetch(), 'android_update_history.retry_failed');
          }}
        />
      </View>
    );
  const releases = history.data.releases.filter((release) => release.notes.trim() !== '');
  if (releases.length === 0) return <OfferNotes notes={notes} />;
  return (
    <View className="gap-4">
      {releases.map((release) => (
        <ReleaseRow key={release.id} release={release} />
      ))}
    </View>
  );
}
