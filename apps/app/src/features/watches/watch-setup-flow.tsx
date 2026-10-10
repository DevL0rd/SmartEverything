import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileRow, WatchCandidate } from '@smarteverything/domain';
import { addXiaomiWatch, listWatchCandidates } from '../../api/people';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { FlowFrame } from '../../components/flow-frame';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { appPlatform } from '../../design/platform';
import { errorText } from '../../format/errors';
import { WATCH_CANDIDATES_KEY } from '../../queries/keys';
import { useActiveProfile, useProfiles } from '../../store/people';

function problemOf(error: unknown): string {
  const text = errorText(error);
  return text.detail === '' ? text.title : text.detail;
}

function Candidates({
  watches,
  chosen,
  onChoose,
}: {
  readonly watches: readonly WatchCandidate[];
  readonly chosen: string | null;
  readonly onChoose: (address: string) => void;
}): ReactNode {
  return (
    <List title="In your Mi Fitness account">
      {watches.map((watch) => (
        <ListRow
          key={watch.address}
          title={watch.name}
          subtitle={watch.deviceId === null ? watch.address : 'Already added'}
          icon="watch"
          disabled={watch.deviceId !== null}
          checked={chosen === watch.address}
          role="checkbox"
          onPress={() => {
            onChoose(watch.address);
          }}
        />
      ))}
    </List>
  );
}

function People({
  profiles,
  chosen,
  onChoose,
}: {
  readonly profiles: readonly ProfileRow[];
  readonly chosen: string | null;
  readonly onChoose: (profileId: string) => void;
}): ReactNode {
  return (
    <List title="Whose watch is it?">
      {profiles.map((profile) => (
        <ListRow
          key={profile.id}
          title={profile.name}
          icon="user"
          checked={chosen === profile.id}
          role="checkbox"
          onPress={() => {
            onChoose(profile.id);
          }}
        />
      ))}
    </List>
  );
}

function Added({ name, here }: { readonly name: string; readonly here: boolean }): ReactNode {
  return (
    <EmptyState
      icon="watch"
      title={`${name} added`}
      body={
        here
          ? 'This phone connects to it now. Open the watch’s page to see its status or pause it for Mi Fitness.'
          : 'Open SmartEverything on its person’s phone to connect.'
      }
    />
  );
}

function Picking({
  chosen,
  profileId,
  onChoose,
  onProfile,
}: {
  readonly chosen: string | null;
  readonly profileId: string | null;
  readonly onChoose: (address: string) => void;
  readonly onProfile: (profileId: string) => void;
}): ReactNode {
  const profiles = useProfiles();
  const candidates = useQuery({
    queryKey: WATCH_CANDIDATES_KEY,
    queryFn: listWatchCandidates,
    retry: false,
  });
  if (candidates.isPending) {
    return <Text tone="variant">Looking in your Mi Fitness account…</Text>;
  }
  if (candidates.isError) {
    return (
      <Banner
        tone="critical"
        title="Couldn’t read your watches"
        body={problemOf(candidates.error)}
        action={{ label: 'Try again', onPress: () => void candidates.refetch() }}
      />
    );
  }
  if (candidates.data.watches.length === 0) {
    return (
      <EmptyState
        icon="watch"
        title="No watches found"
        body="Bind your watch in Mi Fitness first, then try again."
      />
    );
  }
  return (
    <View className="gap-4">
      <Candidates watches={candidates.data.watches} chosen={chosen} onChoose={onChoose} />
      {profiles.length > 1 ? (
        <People profiles={profiles} chosen={profileId} onChoose={onProfile} />
      ) : null}
    </View>
  );
}

interface AddWatch {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly added: string | null;
  readonly add: (address: string | null, profileId: string | null) => void;
}

function useAddWatch(): AddWatch {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const add = (address: string | null, profileId: string | null): void => {
    if (address === null || profileId === null) {
      setProblem(address === null ? 'Pick a watch' : 'Pick whose watch it is');
      return;
    }
    setBusy(true);
    setProblem(null);
    addXiaomiWatch(address, profileId).then(
      (device) => {
        setBusy(false);
        setAdded(device.name);
        void client.invalidateQueries({ queryKey: WATCH_CANDIDATES_KEY });
      },
      (error: unknown) => {
        setBusy(false);
        setProblem(problemOf(error));
      },
    );
  };
  return { busy, problem, added, add };
}

export function WatchSetupFlow(): ReactNode {
  const router = useRouter();
  const active = useActiveProfile();
  const [chosen, setChosen] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(active?.id ?? null);
  const setup = useAddWatch();
  const close = (): void => {
    router.back();
  };
  const footer =
    setup.added === null ? (
      <Button
        label="Add watch"
        loading={setup.busy}
        onPress={() => {
          setup.add(chosen, profileId);
        }}
      />
    ) : (
      <Button label="Done" onPress={close} />
    );
  return (
    <FlowFrame title="Add a watch" onCancel={close} footer={footer}>
      {setup.added === null ? (
        <View className="gap-4">
          <Picking
            chosen={chosen}
            profileId={profileId}
            onChoose={setChosen}
            onProfile={setProfileId}
          />
          {setup.problem === null ? null : <Banner tone="critical" title={setup.problem} />}
        </View>
      ) : (
        <Added name={setup.added} here={appPlatform() === 'android' && profileId === active?.id} />
      )}
    </FlowFrame>
  );
}
