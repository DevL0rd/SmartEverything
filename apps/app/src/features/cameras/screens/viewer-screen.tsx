import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useCameraEntry } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { useViewer, type Viewer } from '../viewer/use-viewer';
import { InCallBar, PresetsRow, RecentForCamera, useAnswering } from '../viewer/viewer-panels';
import { QuickToggles } from '../components/quick-toggles';
import { TimelineSection } from '../viewer/timeline-section';
import { ViewerPlayer } from '../viewer/viewer-player';

function Panels({
  viewer,
  answering,
}: {
  readonly viewer: Viewer;
  readonly answering: boolean;
}): ReactNode {
  return (
    <>
      {answering ? <InCallBar entry={viewer.entry} /> : null}
      <PresetsRow viewer={viewer} />
      <QuickToggles entry={viewer.entry} />
      <TimelineSection entry={viewer.entry} />
    </>
  );
}

function CompactViewer({
  viewer,
  answering,
}: {
  readonly viewer: Viewer;
  readonly answering: boolean;
}): ReactNode {
  return (
    <View className="flex-1 bg-bg">
      <Head>
        <title>{`${viewer.entry.name} · SmartEverything`}</title>
      </Head>
      <View className="bg-black pt-safe">
        <ViewerPlayer viewer={viewer} topBar rounded={false} />
      </View>
      <ScrollView contentContainerClassName="gap-section-gap px-gutter py-section-gap">
        <Panels viewer={viewer} answering={answering} />
        <RecentForCamera entry={viewer.entry} />
      </ScrollView>
    </View>
  );
}

function ViewerHeader({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const router = useRouter();
  return (
    <PageHeader
      title={entry.name}
      {...(entry.room === null ? {} : { subtitle: entry.room })}
      actions={[{ icon: 'film', label: 'Events', href: href.cameraEvents() }]}
      overflow={[
        {
          label: 'Camera settings',
          icon: 'settings',
          onPress: (): void => {
            router.navigate(href.settings.camera(entry.device.id));
          },
        },
      ]}
    />
  );
}

function MediumViewer({
  viewer,
  answering,
}: {
  readonly viewer: Viewer;
  readonly answering: boolean;
}): ReactNode {
  const columns = atLeast(useSizeClass().width, 'expanded');
  return (
    <Screen header={<ViewerHeader entry={viewer.entry} />} maxWidth="detail">
      <ViewerPlayer viewer={viewer} topBar={false} rounded />
      <View className={columns ? 'flex-row items-start gap-section-gap' : 'gap-section-gap'}>
        <View className={columns ? 'min-w-0 flex-1 gap-section-gap' : 'gap-section-gap'}>
          <Panels viewer={viewer} answering={answering} />
        </View>
        <View className={columns ? 'min-w-0 flex-1' : ''}>
          <RecentForCamera entry={viewer.entry} />
        </View>
      </View>
    </Screen>
  );
}

function WideViewer({
  viewer,
  answering,
}: {
  readonly viewer: Viewer;
  readonly answering: boolean;
}): ReactNode {
  return (
    <Screen header={<ViewerHeader entry={viewer.entry} />} maxWidth="dashboard">
      <View className="flex-row items-start gap-section-gap">
        <View className="min-w-0 flex-1 gap-section-gap">
          <ViewerPlayer viewer={viewer} topBar={false} rounded />
          <TimelineSection entry={viewer.entry} />
        </View>
        <View className="w-inspector gap-section-gap">
          {answering ? <InCallBar entry={viewer.entry} /> : null}
          <PresetsRow viewer={viewer} />
          <QuickToggles entry={viewer.entry} />
          <RecentForCamera entry={viewer.entry} />
        </View>
      </View>
    </Screen>
  );
}

function CameraViewer({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const answering = useAnswering();
  const viewer = useViewer(entry, answering);
  const size = useSizeClass();
  if (size.nav === 'bar') {
    return <CompactViewer viewer={viewer} answering={answering} />;
  }
  return atLeast(size.width, 'large') ? (
    <WideViewer viewer={viewer} answering={answering} />
  ) : (
    <MediumViewer viewer={viewer} answering={answering} />
  );
}

export function ViewerScreen(): ReactNode {
  const { cameraId } = useLocalSearchParams<{ cameraId: string }>();
  const entry = useCameraEntry(cameraId);
  if (entry === null) {
    return (
      <Screen header={<PageHeader title="Camera" />} maxWidth="reading">
        <EmptyState
          icon="cameraOff"
          title="Camera not found"
          body="It may have been removed or hidden."
          action={<Button label="All cameras" href={href.cameras()} />}
        />
      </Screen>
    );
  }
  return <CameraViewer key={entry.device.id} entry={entry} />;
}
