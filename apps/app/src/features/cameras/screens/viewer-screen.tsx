import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { Screen } from '../../../components/screen';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useCameraEntry } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { useViewer, type Viewer } from '../viewer/use-viewer';
import { InCallBar, PresetsRow, RecentForCamera, useAnswering } from '../viewer/viewer-panels';
import { QuickToggles } from '../components/quick-toggles';
import { TimelineSection } from '../viewer/timeline-section';
import { viewerClasses, type ViewerLayout } from '../viewer/viewer-layout';
import { ViewerOverlays, ViewerPlayer } from '../viewer/viewer-player';
import { CameraTranscriptFeed } from '../transcripts/camera-transcript-feed';

const log = new Logger('app.cameras');

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
      <CameraTranscriptFeed
        entry={viewer.entry}
        header={
          <View className="gap-section-gap pt-section-gap">
            <Panels viewer={viewer} answering={answering} />
            <RecentForCamera entry={viewer.entry} />
          </View>
        }
      />
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

function RegularViewer({
  viewer,
  answering,
  layout,
}: {
  readonly viewer: Viewer;
  readonly answering: boolean;
  readonly layout: ViewerLayout;
}): ReactNode {
  const css = viewerClasses(layout);
  return (
    <Screen
      header={<ViewerHeader entry={viewer.entry} />}
      maxWidth={css.width}
      scroll={false}
      externalScroll
    >
      <CameraTranscriptFeed
        entry={viewer.entry}
        pageHeader={<ViewerHeader entry={viewer.entry} />}
        maxWidth={css.width}
        header={
          <View className={css.row}>
            <View className={css.main}>
              <ViewerPlayer viewer={viewer} topBar={false} rounded />
              {layout.wide ? <TimelineSection entry={viewer.entry} /> : null}
            </View>
            <View className={css.side}>
              <View className={css.panels}>
                {answering ? <InCallBar entry={viewer.entry} /> : null}
                <PresetsRow viewer={viewer} />
                <QuickToggles entry={viewer.entry} />
                {layout.wide ? null : <TimelineSection entry={viewer.entry} />}
              </View>
              <View className={css.recent}>
                <RecentForCamera entry={viewer.entry} />
              </View>
            </View>
          </View>
        }
      />
    </Screen>
  );
}

function CameraViewer({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const answering = useAnswering();
  const viewer = useViewer(entry, answering);
  const size = useSizeClass();
  const layout = size.nav === 'bar' ? 'compact' : atLeast(size.width, 'large') ? 'wide' : 'medium';
  const deviceId = entry.device.id;
  useEffect(() => {
    log.debug('viewer.layout_changed', { deviceId, layout, answering });
  }, [deviceId, layout, answering]);
  return (
    <>
      {size.nav === 'bar' ? (
        <CompactViewer viewer={viewer} answering={answering} />
      ) : (
        <RegularViewer
          viewer={viewer}
          answering={answering}
          layout={{ wide: layout === 'wide', columns: atLeast(size.width, 'expanded') }}
        />
      )}
      <ViewerOverlays viewer={viewer} />
    </>
  );
}

export function ViewerScreen(): ReactNode {
  const { cameraId } = useLocalSearchParams<{ cameraId: string }>();
  const entry = useCameraEntry(cameraId);
  const found = entry !== null;
  useLifecycleLog(log, 'viewer', cameraId);
  useEffect(() => {
    if (!found) {
      log.warn('viewer.camera_missing', { cameraId });
    }
  }, [cameraId, found]);
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
