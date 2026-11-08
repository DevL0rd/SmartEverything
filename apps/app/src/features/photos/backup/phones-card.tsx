import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { BackupState } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Arc, ProgressBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import { useProfiles } from '../../../store/people';
import { usePhotoBackupState } from '../data';
import { phoneViewOf, type LiveProgress, type PhoneView } from './phones-model';

const RING = 40;

function PhoneLine({ view }: { readonly view: PhoneView }): ReactNode {
  return (
    <View className="flex-row items-center gap-3 border-t border-outline-variant px-4 py-2.5">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${view.title} ${percent(view.coverage)} backed up`}
        className="size-10"
      >
        <Arc value={view.coverage} size={RING} thickness={4} colour={view.colour} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="shrink">
            {view.title}
          </Text>
          {view.person === null ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {view.person}
            </Text>
          )}
          <Badge label={view.badge.label} tone={view.badge.tone} />
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {view.detail}
        </Text>
        <ProgressBar
          progress={view.coverage}
          colour={view.colour}
          label={`${view.title} ${percent(view.coverage)} backed up`}
        />
      </View>
    </View>
  );
}

export function usePhoneViews(
  states: readonly BackupState[],
  live: LiveProgress,
  except: string | null,
): readonly PhoneView[] {
  const people = useProfiles();
  return states
    .filter((state) => state.device.deviceId !== except)
    .map((state) =>
      phoneViewOf(
        state,
        live.devices.get(state.device.deviceId),
        people.find((person) => person.id === state.device.profileId)?.name ?? null,
      ),
    );
}

function NoPhones(): ReactNode {
  return (
    <View className="border-t border-outline-variant px-2 py-2">
      <EmptyState
        compact
        icon="smartphone"
        title="No devices back up yet"
        body="Open Photos on your phone or computer and turn on backup. Each device sets its own."
      />
    </View>
  );
}

interface ListProps {
  readonly live: LiveProgress;
  readonly except: string | null;
}

function NoOtherPhones(): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="border-t border-outline-variant px-4 py-3">
      No other devices back up here.
    </Text>
  );
}

function PhoneList({
  states,
  live,
  except,
}: ListProps & { readonly states: readonly BackupState[] }): ReactNode {
  const views = usePhoneViews(states, live, except);
  if (views.length === 0) return except === null ? <NoPhones /> : <NoOtherPhones />;
  return views.map((view) => <PhoneLine key={view.key} view={view} />);
}

function PhonesBody({ live, except }: ListProps): ReactNode {
  const query = usePhotoBackupState();
  if (query.data !== undefined) {
    return <PhoneList states={query.data} live={live} except={except} />;
  }
  if (query.isError) {
    return (
      <View className="px-4 pb-4">
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), 'photos.backup.phones_refetch_failed');
          }}
        />
      </View>
    );
  }
  return (
    <View aria-busy className="gap-2 px-4 pb-4">
      <Skeleton shape="line" className="h-12" />
      <Skeleton shape="line" className="h-12" />
    </View>
  );
}

export function PhonesCard({ live, except }: ListProps): ReactNode {
  return (
    <Card
      title={except === null ? 'Devices' : 'Other devices'}
      padding="none"
      metadata={
        except === null ? (
          <Text variant="caption" tone="variant">
            Each device sets its own backup
          </Text>
        ) : null
      }
    >
      <PhonesBody live={live} except={except} />
    </Card>
  );
}
