import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { PhotoAiStatus, PhotoPeople } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { useMutationState } from '../../../store/mutation';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { setPhotoAiSettings } from '../smart/api';
import { usePhotoAiStatus, storeAiStatus } from '../smart/queries';
import { PHOTOS_SMART_PAGE } from '../smart/page';
import {
  namingOf,
  peopleSectionsOf,
  peopleStateOf,
  peopleSubtitleOf,
  type PeopleState,
} from './model';
import {
  FaceRing,
  GroupSection,
  MergeSuggestions,
  PeopleHeader,
  PetsSection,
} from './people-parts';
import { usePhotoPeople } from './queries';

const SMART_HREF = href.settings.page(PHOTOS_SMART_PAGE);

export const UNSORTED_NOTE = 'Faces seen in one photo so far. Name one to start a person.';

function GroupingOff(): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  return (
    <Card title="Face grouping is off" icon="users">
      <View className="gap-3">
        <Text variant="body">
          Turn it on to find the people and pets in your photos. It runs on your home hub and faces
          never leave it.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            label="Turn on face grouping"
            variant="filled"
            loading={mutation.busy}
            onPress={() => {
              mutation.run(() => setPhotoAiSettings({ faceGrouping: true }), {
                failure: 'Face grouping stayed off',
                label: 'photos.people.grouping_on',
                onDone: (status) => {
                  storeAiStatus(client, status);
                },
              });
            }}
          />
          <Button label="Smart features" variant="text" href={SMART_HREF} />
        </View>
      </View>
    </Card>
  );
}

function Indexing({ status }: { readonly status: PhotoAiStatus }): ReactNode {
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-4">
        <FaceRing status={status} size={88} />
        <View className="min-w-48 flex-1 gap-1">
          <Text variant="title-3">Looking for faces</Text>
          <Text variant="footnote" tone="variant">
            People and pets appear here as your home hub finds them. Nothing needs to stay open.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy className="gap-section-gap">
      <Skeleton shape="block" className="h-28 w-full" />
      <View className="flex-row flex-wrap gap-4">
        {['a', 'b', 'c', 'd', 'e'].map((key) => (
          <Skeleton key={key} shape="block" className="size-24 rounded-full" />
        ))}
      </View>
    </View>
  );
}

function Ready({
  people,
  status,
}: {
  readonly people: PhotoPeople;
  readonly status: PhotoAiStatus | undefined;
}): ReactNode {
  const [species, setSpecies] = useState<string | null>(null);
  const size = libraryLayoutOf(useAreaWidth()) === 'compact' ? 80 : 112;
  const sections = peopleSectionsOf(people.groups, species);
  return (
    <View className="gap-section-gap">
      <PeopleHeader sections={sections} status={status} naming={namingOf(people.groups)} />
      <MergeSuggestions people={people} />
      <GroupSection title="People" groups={sections.people} size={size} />
      <PetsSection
        all={people.groups}
        pets={sections.pets}
        species={species}
        size={size}
        onSpecies={setSpecies}
      />
      <GroupSection
        title="Unsorted faces"
        groups={sections.unsorted}
        size={size}
        note={UNSORTED_NOTE}
      />
      <GroupSection
        title="Hidden"
        groups={sections.hidden}
        size={size}
        note="Hidden from People and pets and from search suggestions. Open one to show it again."
      />
    </View>
  );
}

function StateBody({
  state,
  people,
  status,
  failed,
  retry,
}: {
  readonly state: PeopleState;
  readonly people: PhotoPeople | undefined;
  readonly status: PhotoAiStatus | undefined;
  readonly failed: unknown;
  readonly retry: () => void;
}): ReactNode {
  switch (state) {
    case 'ready':
      return people === undefined ? null : <Ready people={people} status={status} />;
    case 'loading':
      return <Loading />;
    case 'offline':
      return (
        <EmptyState
          icon="wifiOff"
          title="The hub is offline"
          body="People and pets come back when your home hub answers."
        />
      );
    case 'error':
      return <ErrorState error={failed} retry={retry} page />;
    case 'grouping-off':
      return <GroupingOff />;
    case 'indexing':
      return status === undefined ? null : <Indexing status={status} />;
    case 'empty':
      return (
        <EmptyState
          icon="users"
          title="No faces yet"
          body="When photos with people or pets reach your library, your home hub groups them here."
          action={<Button label="Open Library" variant="tonal" href={href.photos()} />}
        />
      );
  }
}

export function PeopleScreen(): ReactNode {
  const live = useSyncStatus().status === 'live';
  const people = usePhotoPeople();
  const status = usePhotoAiStatus();
  const state = peopleStateOf({
    people: people.data,
    status: status.data,
    failed: people.isError,
    live,
  });
  const subtitle = peopleSubtitleOf(people.data);
  return (
    <PhotosFrame
      active="people"
      {...(subtitle === null ? {} : { subtitle })}
      {...(live || people.data === undefined
        ? {}
        : {
            banner: (
              <Banner
                tone="info"
                title="Offline · showing the last snapshot"
                body="Names and merges wait for your home hub."
                wrapBody
              />
            ),
          })}
    >
      <View className="gap-section-gap">
        <StateBody
          state={state}
          people={people.data}
          status={status.data}
          failed={people.error}
          retry={() => {
            background(people.refetch(), 'photos.people.refetch_failed');
          }}
        />
      </View>
    </PhotosFrame>
  );
}
