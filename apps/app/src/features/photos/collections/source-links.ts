import type { DriveItemLink, PhotoSource } from '@smarteverything/domain';
import { assistantAttachmentLinks } from '../../../api/assistant';
import { recordingLinks, type SignedLink } from '../../../api/media';
import { DriveLinkCache, routeGeneration, type ReadLinks } from '../../drive';

type Links = Readonly<Record<string, SignedLink>>;

export const SOURCE_REV = 1;

export function sourceLinksOf(
  ids: readonly string[],
  thumbs: Links,
  files: Links,
): readonly DriveItemLink[] {
  return ids.flatMap((id): DriveItemLink[] => {
    const file = files[id];
    if (file === undefined) return [];
    return [
      {
        itemId: id,
        rev: SOURCE_REV,
        file,
        thumb: thumbs[id] ?? null,
        preview: null,
        playable: null,
      },
    ];
  });
}

export const readCameraLinks: ReadLinks = async (ids) => {
  const [thumbs, files] = await Promise.all([
    recordingLinks(ids, 'thumb'),
    recordingLinks(ids, 'full'),
  ]);
  return sourceLinksOf(ids, thumbs, files);
};

export const readAiLinks: ReadLinks = async (ids) => {
  const links = await assistantAttachmentLinks(ids);
  return sourceLinksOf(ids, links, links);
};

export const sourceLinks: Readonly<Record<PhotoSource, DriveLinkCache>> = {
  cameras: new DriveLinkCache(readCameraLinks, Date.now, routeGeneration),
  ai: new DriveLinkCache(readAiLinks, Date.now, routeGeneration),
};
