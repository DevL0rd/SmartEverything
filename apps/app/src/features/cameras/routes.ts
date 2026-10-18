import { Image } from 'react-native';
import { API_ENDPOINTS as E, CAMERA_EVENT_SEARCH_WORDS } from '@smarteverything/domain';
import { api } from '../../api/transport';
import type { PreloadContext, RouteDefinition } from '../../app-shell/route-types';
import { CAMERA_LIST_KEY } from '../../queries/keys';
import { snapshotQuery } from '../device-visuals';

export async function preloadCameras({ queryClient }: PreloadContext): Promise<void> {
  const cameras = await queryClient.query({
    queryKey: CAMERA_LIST_KEY,
    queryFn: () => api().call(E.listCameras, {}),
  });
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
    keywords: [
      'motion',
      'clips',
      'recordings',
      'calls',
      'doorbell',
      'history',
      ...CAMERA_EVENT_SEARCH_WORDS,
    ],
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

export const TRANSCRIPT_ACTIONS = [
  {
    key: 'transcripts',
    title: 'Camera transcripts',
    icon: 'fileText',
    href: { pathname: '/cameras', params: { focus: 'transcripts' } },
    keywords: ['speech', 'what was said', 'transcribe', 'history', 'text'],
  },
  {
    key: 'transcript-search',
    title: 'Search camera transcripts',
    icon: 'search',
    href: { pathname: '/cameras', params: { focus: 'transcript-search' } },
    keywords: ['find speech', 'conversation', 'what was said', 'text'],
  },
] as const;
