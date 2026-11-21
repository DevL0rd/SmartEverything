import {
  GithubReleaseError,
  githubReleaseToken,
  githubRepositoryOf,
  stageGithubRelease,
  type ReleaseTarget,
} from '../../../releases/github-source';
import { releaseStaging } from '../../../releases/staging';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { requireUpdateRequester } from './update-requester';

export interface StagedUploadRequest {
  readonly artifact: 'apk' | 'ui' | 'desktop';
  readonly source: 'provided' | 'github';
  readonly input: {
    readonly upload?: string | undefined;
    readonly tag?: string | undefined;
    readonly commit?: string | undefined;
  };
  readonly target?: ReleaseTarget | undefined;
}

async function githubUpload(context: ToolContext, request: StagedUploadRequest): Promise<string> {
  await requireUpdateRequester(context);
  const { layout } = context;
  try {
    const upload = await stageGithubRelease(
      {
        ...(await githubRepositoryOf(layout)),
        staging: releaseStaging(layout, () => context.clock.now()),
        token: await githubReleaseToken(layout.system.keys),
        fetch,
      },
      {
        artifact: request.artifact,
        tag: request.input.tag,
        commit: request.input.commit,
        target: request.target,
      },
    );
    return upload.uploadId;
  } catch (cause) {
    if (cause instanceof GithubReleaseError)
      throw new ToolError(
        `${cause.reason}: ${cause.message}`,
        cause.reason === 'unavailable' ? 'unavailable' : 'invalid_request',
      );
    throw cause;
  }
}

export async function stagedUpload(
  context: ToolContext,
  request: StagedUploadRequest,
): Promise<string> {
  if (request.source === 'github') return githubUpload(context, request);
  if (request.input.upload === undefined)
    throw new ToolError('source provided needs the staged upload ID');
  return request.input.upload;
}

export async function discardStagedUpload(
  context: Pick<ToolContext, 'actor' | 'caller' | 'store' | 'layout' | 'clock'>,
  upload: string,
): Promise<ToolOutput> {
  await requireUpdateRequester(context);
  return {
    structured: {
      discarded: await releaseStaging(context.layout, () => context.clock.now()).discard(upload),
    },
  };
}
