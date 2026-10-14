import { isCamera, type SearchSources } from '@smarteverything/domain';
import { TRANSCRIPT_ACTIONS } from '../features/cameras/routes';
import type { NamedDevice, SourceLinks } from './sources';

export function cameraTranscriptPages(
  devices: readonly NamedDevice[],
  out: SourceLinks,
): SearchSources['pages'] {
  return devices
    .filter((named) => isCamera(named.device))
    .flatMap((named) =>
      TRANSCRIPT_ACTIONS.map((action) => {
        const path = `camera-${action.key}:${named.device.id}`;
        const key = `page:${path}`;
        out.links.set(key, {
          pathname: '/cameras/[cameraId]',
          params: { cameraId: named.device.id, focus: action.key },
        });
        out.icons.set(key, action.icon);
        out.parents.set(key, `device:${named.device.id}`);
        return {
          path,
          title: `${action.title} — ${named.name}`,
          description: 'Camera transcripts',
          keywords: [...action.keywords, named.name],
        };
      }),
    );
}
