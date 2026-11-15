import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { WidgetBoard, useBoardEditor, type BoardEditor } from '../../../components/widget-board';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import {
  CameraTranscriptFeed,
  transcriptSearchOf,
  useCameraTranscripts,
} from '../transcripts/camera-transcript-feed';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { useCameraBanners } from '../components/camera-banners';
import { useCameraPrefs } from '../data/use-camera-condition';
import { useCameraEntries } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import {
  CAMERAS_PAGE,
  CAMERA_WIDGETS,
  cameraDefaults,
  cameraInstanceAvailable,
} from '../live/widgets';

const log = new Logger('app.cameras');

const AVAILABLE: ReadonlySet<string> = new Set(['camera', 'camera-events']);

function useActions(): readonly ShellAction[] {
  const size = useSizeClass();
  const prefs = useCameraPrefs();
  const muted = prefs.value.muted;
  return [
    { icon: 'film', label: 'Events', href: href.cameraEvents() },
    {
      icon: muted ? 'muted' : 'volume',
      label: muted ? 'Muted' : 'Sound on',
      selected: !muted,
      onPress: (): void => {
        log.info('cameras.mute_toggled', { muted: !muted });
        prefs.set({ muted: !muted });
      },
    },
    ...(size.idiom === 'pointer' && atLeast(size.width, 'expanded')
      ? [
          {
            icon: 'monitor',
            label: 'Monitor mode',
            href: href.cameraMonitor(),
          } satisfies ShellAction,
        ]
      : []),
  ];
}

function NoCameras(): ReactNode {
  return (
    <EmptyState
      icon="cameras"
      title="No cameras yet"
      body="Link the account your cameras use and they show up here."
      action={<Button label="Add a device" href={href.settings.page('devices/add')} />}
    />
  );
}

function useCamerasEditor(entries: readonly CameraEntry[]): BoardEditor {
  return useBoardEditor({
    page: CAMERAS_PAGE,
    layout: usePageLayout(CAMERAS_PAGE),
    defaults: cameraDefaults(entries),
    onSave: useSavePageLayout(CAMERAS_PAGE),
  });
}

export function LiveScreen(): ReactNode {
  const entries = useCameraEntries();
  const actions = useActions();
  const banner = useCameraBanners();
  const cameraCount = entries.length;
  useLifecycleLog(log, 'cameras_screen');
  useEffect(() => {
    log.debug('cameras.list_changed', { cameras: cameraCount });
  }, [cameraCount]);
  const editor = useCamerasEditor(entries);
  const board = (
    <WidgetBoard
      editor={editor}
      catalogue={CAMERA_WIDGETS}
      available={AVAILABLE}
      instanceAvailable={cameraInstanceAvailable(entries)}
    />
  );
  const listMode = !editor.editing && entries.length > 0;
  const transcripts = useCameraTranscripts(undefined, listMode);
  return (
    <PageShell
      title="Cameras"
      settings={mainPageSettings('cameras')}
      actions={editor.editing ? [] : [editor.editAction, ...actions]}
      editing={editor.header}
      scroll={!listMode}
      {...(listMode ? { search: transcriptSearchOf(transcripts) } : {})}
      {...(banner === undefined || listMode ? {} : { banner })}
    >
      {entries.length === 0 ? (
        <NoCameras />
      ) : editor.editing ? (
        board
      ) : (
        <View className="-mx-gutter min-h-0 flex-1">
          <CameraTranscriptFeed
            transcripts={transcripts}
            banner={banner}
            header={board}
            shellSearch
          />
        </View>
      )}
    </PageShell>
  );
}
