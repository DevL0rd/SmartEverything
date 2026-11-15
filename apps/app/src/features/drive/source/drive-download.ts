import type { DriveDownload, DriveItemLink } from '@smarteverything/domain';
import type { DownloadPlanView, PreparedDownload } from '../../files';
import { prepareDriveDownload, readRoutedDriveLinks, type PreparedDriveDownload } from '../data';
import { itemIdOf, itemOf, type DriveNode } from './drive-node';

export class DriveDownloadRefusedError extends Error {
  override readonly name = 'DriveDownloadRefusedError';
}

export interface DriveDownloadEnv {
  readonly links: (itemIds: readonly string[]) => Promise<readonly DriveItemLink[]>;
  readonly prepare: (itemIds: readonly string[]) => Promise<PreparedDriveDownload>;
}

export const LIVE_DOWNLOAD: DriveDownloadEnv = {
  links: readRoutedDriveLinks,
  prepare: prepareDriveDownload,
};

const VIEW_ONLY_TEXT = 'The owner made this view only. It can be opened here, but not downloaded.';

const NOTHING_TEXT = 'There is nothing to download.';

function planOf(download: DriveDownload): DownloadPlanView {
  return { ...download };
}

async function fileOf(node: DriveNode, env: DriveDownloadEnv): Promise<PreparedDownload> {
  const itemId = itemIdOf(node);
  const links = await env.links([itemId]);
  const link = links.find((candidate) => candidate.itemId === itemId)?.download ?? null;
  if (link === null) throw new DriveDownloadRefusedError(VIEW_ONLY_TEXT);
  const size = node.size ?? 0;
  const download: DriveDownload = {
    kind: 'file',
    name: node.name,
    size,
    files: 1,
    folders: 0,
    bytes: size,
    skipped: [],
    url: link.url,
    expiresAt: link.expiresAt,
  };
  return { download: planOf(download), url: link.url };
}

export async function driveDownloadOf(
  nodes: readonly DriveNode[],
  env: DriveDownloadEnv = LIVE_DOWNLOAD,
): Promise<PreparedDownload> {
  const [only] = nodes;
  if (only === undefined) throw new DriveDownloadRefusedError(NOTHING_TEXT);
  if (nodes.length === 1 && only.kind !== 'folder' && itemOf(only) !== null) {
    return fileOf(only, env);
  }
  const prepared = await env.prepare(nodes.map(itemIdOf));
  return { download: planOf(prepared.download), url: prepared.url };
}
