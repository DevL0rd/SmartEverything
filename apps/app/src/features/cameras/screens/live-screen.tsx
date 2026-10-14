import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { WidgetBoard, useBoardEditor } from '../../../components/widget-board';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { usePageLayout, useSavePageLayout } from '../../../store/layouts';
import { useCameraBanners } from '../components/camera-banners';
import { useCameraPrefs } from '../data/use-camera-condition';
import { useCameraEntries } from '../data/use-cameras';
import {
  CAMERAS_PAGE,
  CAMERA_WIDGETS,
  cameraDefaults,
  cameraInstanceAvailable,
} from '../live/widgets';

const AVAILABLE: ReadonlySet<string> = new Set(['camera', 'camera-events']);

function useActions(): readonly HeaderAction[] {
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
        prefs.set({ muted: !muted });
      },
    },
    ...(size.idiom === 'pointer' && atLeast(size.width, 'expanded')
      ? [
          {
            icon: 'monitor',
            label: 'Monitor mode',
            href: href.cameraMonitor(),
          } satisfies HeaderAction,
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

export function LiveScreen(): ReactNode {
  const entries = useCameraEntries();
  const actions = useActions();
  const banner = useCameraBanners();
  const editor = useBoardEditor({
    page: CAMERAS_PAGE,
    layout: usePageLayout(CAMERAS_PAGE),
    defaults: cameraDefaults(entries),
    onSave: useSavePageLayout(CAMERAS_PAGE),
  });
  return (
    <Screen
      header={
        <PageHeader
          title="Cameras"
          settings={mainPageSettings('cameras')}
          actions={editor.editing ? [] : [editor.editAction, ...actions]}
          editing={editor.header}
        />
      }
      {...(banner === undefined ? {} : { banner })}
    >
      {entries.length === 0 ? (
        <NoCameras />
      ) : (
        <WidgetBoard
          editor={editor}
          catalogue={CAMERA_WIDGETS}
          available={AVAILABLE}
          instanceAvailable={cameraInstanceAvailable(entries)}
        />
      )}
    </Screen>
  );
}
