import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { Screen } from '../../../components/screen';
import { useScreen } from '../../../components/screen-context';
import { useMeasuredWidth, type MeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { GUTTER, SEMANTIC_SIZES } from '../../../design/tokens';
import { useCameraEntry } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { useViewer, type Viewer } from '../viewer/use-viewer';
import { InCallBar, PresetsRow, RecentForCamera, useAnswering } from '../viewer/viewer-panels';
import { QuickToggles } from '../components/quick-toggles';
import { TimelineSection } from '../viewer/timeline-section';
import {
  playerSlot,
  viewerClasses,
  viewerLayoutFor,
  viewerUsesFullWidth,
  type ViewerLayout,
} from '../viewer/viewer-layout';
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

interface ViewerContentProps {
  readonly viewer: Viewer;
  readonly answering: boolean;
  readonly layout: ViewerLayout;
  readonly onLayout: MeasuredWidth['onLayout'];
  readonly full: boolean;
  readonly gap: number;
  readonly gutter: number;
  readonly compact: boolean;
}

interface PlayerSlotLayout {
  readonly placement: ComponentProps<typeof Animated.View>['style'];
  readonly fitted: ViewStyle | undefined;
  readonly onHeaderLayout: (event: LayoutChangeEvent) => void;
  readonly onPlayerLayout: (event: LayoutChangeEvent) => void;
}

function usePlayerSlot({ full, gap, gutter, compact }: ViewerContentProps): PlayerSlotLayout {
  const { height } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const slot = playerSlot({ height, headerHeight, gap, gutter, width, full, compact });
  const { scrollY } = useScreen();
  const movement = useAnimatedStyle(
    (): ViewStyle => ({ transform: [{ translateY: compact ? 0 : -scrollY.get() }] }),
    [compact, scrollY],
  );
  return {
    placement: [slot.position, movement],
    fitted: slot.fitted,
    onHeaderLayout: ({ nativeEvent }): void => {
      setHeaderHeight(nativeEvent.layout.height);
    },
    onPlayerLayout: ({ nativeEvent }): void => {
      setWidth(nativeEvent.layout.width);
    },
  };
}

interface PlayerColumnsProps {
  readonly viewer: Viewer;
  readonly answering: boolean;
  readonly layout: ViewerLayout;
  readonly full: boolean;
  readonly onLayout: MeasuredWidth['onLayout'];
  readonly fitted: ViewStyle | undefined;
  readonly onPlayerLayout: (event: LayoutChangeEvent) => void;
}

function PlayerColumns({
  viewer,
  answering,
  layout,
  full,
  onLayout,
  fitted,
  onPlayerLayout,
}: PlayerColumnsProps): ReactNode {
  const css = viewerClasses(layout, full);
  const timelineBeside = full || !layout.wide;
  return (
    <View onLayout={onLayout} className={css.row}>
      <View className={css.main} style={fitted}>
        <View onLayout={onPlayerLayout} className="aspect-video w-full" />
        {timelineBeside ? null : <TimelineSection entry={viewer.entry} />}
      </View>
      <View className={css.side}>
        <View className={css.panels}>
          {answering ? <InCallBar entry={viewer.entry} /> : null}
          <PresetsRow viewer={viewer} />
          <QuickToggles entry={viewer.entry} />
          {timelineBeside ? <TimelineSection entry={viewer.entry} /> : null}
        </View>
        <View className={css.recent}>
          <RecentForCamera entry={viewer.entry} />
        </View>
      </View>
    </View>
  );
}

function ViewerContent(props: ViewerContentProps): ReactNode {
  const { viewer, answering, compact, layout, full } = props;
  const slot = usePlayerSlot(props);
  const header = compact ? (
    <View className="gap-grid-gap pt-grid-gap">
      <Panels viewer={viewer} answering={answering} />
      <RecentForCamera entry={viewer.entry} />
    </View>
  ) : (
    <PlayerColumns {...props} fitted={slot.fitted} onPlayerLayout={slot.onPlayerLayout} />
  );
  return (
    <View className={cn('relative min-h-0 flex-1 overflow-hidden', compact && 'bg-bg')}>
      <Animated.View
        className={compact ? 'bg-black pt-safe' : 'absolute z-10'}
        style={slot.placement}
      >
        <ViewerPlayer viewer={viewer} topBar={compact} rounded={!compact} />
      </Animated.View>
      <CameraTranscriptFeed
        entry={viewer.entry}
        {...(compact
          ? {}
          : {
              pageHeader: (
                <View onLayout={slot.onHeaderLayout}>
                  <ViewerHeader entry={viewer.entry} />
                </View>
              ),
            })}
        headerWidth={compact ? 'full' : viewerClasses(layout, full).width}
        header={header}
      />
    </View>
  );
}

function CameraViewer({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const answering = useAnswering();
  const viewer = useViewer(entry, answering);
  const size = useSizeClass();
  const density = useThemeSetting('density');
  const sizes = SEMANTIC_SIZES[size.idiom][density];
  const gutter = GUTTER[size.width] - sizes.gutterShrink;
  const available = size.area - 2 * gutter;
  const pane = useMeasuredWidth(undefined, available);
  const full = viewerUsesFullWidth(available, sizes.sectionGap);
  const regular = viewerLayoutFor(pane.width, sizes.sectionGap);
  const layout = size.nav === 'bar' ? 'compact' : regular.wide ? 'wide' : 'medium';
  const deviceId = entry.device.id;
  useEffect(() => {
    log.debug('viewer.layout_changed', { deviceId, layout, answering });
  }, [deviceId, layout, answering]);
  const compact = size.nav === 'bar';
  return (
    <>
      {compact ? (
        <Head>
          <title>{`${entry.name} · SmartEverything`}</title>
        </Head>
      ) : null}
      <Screen
        {...(compact ? {} : { header: <ViewerHeader entry={entry} /> })}
        scroll={false}
        externalScroll
      >
        <ViewerContent
          viewer={viewer}
          answering={answering}
          layout={regular}
          onLayout={pane.onLayout}
          full={full}
          gap={sizes.sectionGap}
          gutter={gutter}
          compact={compact}
        />
      </Screen>
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
