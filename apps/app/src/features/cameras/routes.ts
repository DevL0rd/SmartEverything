import { Image } from 'react-native';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../api/transport';
import type { PreloadContext, RouteDefinition } from '../../app-shell/route-types';
import { snapshotQuery } from '../device-visuals';

export async function preloadCameras({ queryClient }: PreloadContext): Promise<void> {
  const cameras = await api().call(E.listCameras, {});
  await Promise.all(
    cameras.map(async (camera) => {
      const link = await queryClient.query(snapshotQuery(camera.device_id, 'thumb'));
      await Image.prefetch(link.url);
    }),
  );
}

const hasCameras = (availability: { readonly hasCameras: boolean }): boolean =>
  availability.hasCameras;

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'camera-events',
    href: '/cameras/events',
    title: 'Camera events',
    shortTitle: 'Events',
    icon: 'film',
    tab: 'cameras',
    parent: 'cameras',
    keywords: ['motion', 'clips', 'recordings', 'calls', 'doorbell', 'history'],
    available: hasCameras,
    preload: preloadCameras,
    searchable: true,
  },
  {
    key: 'camera-monitor',
    href: '/cameras/monitor',
    title: 'Monitor mode',
    icon: 'monitor',
    tab: 'cameras',
    parent: 'cameras',
    keywords: ['wall', 'grid', 'kiosk', 'all cameras'],
    available: hasCameras,
    preload: preloadCameras,
    searchable: true,
  },
];
