import {
  ApiError,
  FILE_PATH,
  MEDIA_PATHS,
  buildPath,
  type MediaLink,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import type { ComputerViewer } from './computer-access';
import { NotAComputerError } from './computer-errors';
import type { ComputerService } from './computer-service';

const OWNER_CLAIM = 'owner';

const CLAIMS = z.strictObject({
  path: FILE_PATH,
  viewer: z.string().min(1),
  v: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  download: z.literal('1').optional(),
});

export interface FileTarget {
  readonly path: string;
  readonly viewer: ComputerViewer;
  readonly version: string | null;
  readonly download: boolean;
}

export function viewerClaim(viewer: ComputerViewer): string {
  if (viewer.owner) return OWNER_CLAIM;
  if (viewer.profileId === null) throw new NotAComputerError();
  return viewer.profileId;
}

function viewerOfClaim(claim: string): ComputerViewer {
  return claim === OWNER_CLAIM
    ? { owner: true, profileId: null }
    : { owner: false, profileId: claim };
}

export function signedFileLink(
  links: Pick<MediaLinks, 'claimed'>,
  pattern: keyof typeof MEDIA_PATHS,
  params: Readonly<Record<string, string>>,
  target: { readonly path: string; readonly viewer: ComputerViewer } & Partial<
    Pick<FileTarget, 'version' | 'download'>
  >,
): MediaLink {
  const claims: Record<string, string> = {
    path: target.path,
    viewer: viewerClaim(target.viewer),
  };
  if (target.version !== undefined && target.version !== null) claims['v'] = target.version;
  if (target.download === true) claims['download'] = '1';
  return links.claimed(buildPath(MEDIA_PATHS[pattern], params), claims);
}

export function verifiedTarget(
  links: Pick<MediaLinks, 'verifyClaimed'>,
  request: Parameters<RawRoute['handle']>[0],
): FileTarget {
  const claims = CLAIMS.safeParse(links.verifyClaimed(new URL(request.url ?? '/', 'http://hub')));
  if (!claims.success) {
    throw new ApiError('unauthorized', 'This media link does not name a file.');
  }
  return {
    path: claims.data.path,
    viewer: viewerOfClaim(claims.data.viewer),
    version: claims.data.v ?? null,
    download: claims.data.download === '1',
  };
}

export interface FileAsker {
  readonly viewer: ComputerViewer;
  readonly deviceId: string;
}

export function asked<T>(
  service: ComputerService,
  { viewer, deviceId }: FileAsker,
  request: NodeRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  return service.askAs(viewer, { deviceId, request, confirmed: false, person: false }, schema);
}
