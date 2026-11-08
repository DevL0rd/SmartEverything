import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import {
  API_ENDPOINTS as E,
  APP_UPDATE_BLOB_UPLOAD_PATH,
  APP_UPDATE_ENTRY,
  APP_UPDATE_FILE,
  ApiError,
  type AppUpdateBlobStaged,
  type AppUpdateChange,
  type AppUpdateChannel,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdatePruned,
  type AppUpdatePublication,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import type { RawRoute } from '../server/http-server';
import { authenticate } from '../server/auth';
import { sendJson } from '../server/http';
import { assertOwnerRoute } from '../server/owner-route';
import { bound, type ExtensionRouteTable } from '../server/router';
import type { Store } from '../store/store';
import {
  ClockBehindError,
  NothingToRollBackError,
  UpdateNotFoundError,
  UpdateTargetedPromotionError,
  UpdateWithdrawnError,
  promoteEntry,
  rollbackEntries,
  withdrawEntry,
  type RollbackRequest,
} from './actions';
import { AppUpdateCandidateError, verifyNextOffer } from './candidate';
import { verifyHermesBundle } from './hermes-bundle';
import { blobFile, blobSize, pruneBlobs, publishEntry, receiveBlob, updateIndex } from './store';
import type { AppUpdateFolder } from './update-folder';

function refusal(cause: unknown): unknown {
  if (cause instanceof UpdateNotFoundError) {
    return new ApiError('not_found', cause.message);
  }
  if (
    cause instanceof AppUpdateCandidateError ||
    cause instanceof UpdateWithdrawnError ||
    cause instanceof UpdateTargetedPromotionError ||
    cause instanceof NothingToRollBackError ||
    cause instanceof ClockBehindError
  ) {
    return new ApiError('conflict', cause.message);
  }
  return cause;
}

function filesOf(entry: AppUpdateEntry): readonly AppUpdateFile[] {
  return entry.launch === null ? entry.files : [entry.launch, ...entry.files];
}

async function verifyStored(layout: HubLayout, entry: AppUpdateEntry): Promise<void> {
  for (const file of filesOf(entry)) {
    const size = await blobSize(layout, file.sha256);
    if (size === null) {
      throw new ApiError('invalid_request', `${file.path} was not uploaded.`);
    }
    if (size !== file.size) {
      throw new ApiError(
        'invalid_request',
        `${file.path} has ${String(size)} bytes; the publication says ${String(file.size)}.`,
      );
    }
  }
}

async function verifyReleaseLaunch(layout: HubLayout, entry: AppUpdateEntry): Promise<void> {
  if (entry.platform !== 'android' || entry.channel !== 'release') return;
  verifyHermesBundle(entry.launch.path, await readFile(blobFile(layout, entry.launch.sha256)));
}

export class AppUpdatePublisher {
  constructor(
    private readonly layout: HubLayout,
    private readonly folder: AppUpdateFolder,
    private readonly now: () => Date,
    private readonly log: Logger,
  ) {}

  stage(sha256: string, input: Readable): Promise<AppUpdateBlobStaged> {
    return receiveBlob(this.layout, sha256, input);
  }

  async publish(publication: AppUpdatePublication): Promise<AppUpdateEntry> {
    const entry = await this.changing(() =>
      publishEntry(this.layout, async (index) => {
        const candidate = APP_UPDATE_ENTRY.parse({
          ...publication,
          id: randomUUID(),
          createdAt: this.now().toISOString(),
          withdrawn: null,
        });
        await verifyStored(this.layout, candidate);
        await verifyReleaseLaunch(this.layout, candidate);
        verifyNextOffer(index, candidate);
        return candidate;
      }),
    );
    this.log.info('app_update.published', {
      id: entry.id,
      platform: entry.platform,
      channel: entry.channel,
      runtimeVersion: entry.runtimeVersion,
      files: entry.files.length,
    });
    return entry;
  }

  promote(request: {
    readonly id: string;
    readonly channel: AppUpdateChannel;
  }): Promise<AppUpdateChange> {
    return this.changing(() =>
      updateIndex(this.layout, async (index) => {
        const change = promoteEntry(index, request, this.moment());
        for (const entry of change.result.entries) await verifyReleaseLaunch(this.layout, entry);
        return change;
      }),
    );
  }

  rollback(request: RollbackRequest): Promise<AppUpdateChange> {
    return this.changing(() =>
      updateIndex(this.layout, (index) => rollbackEntries(index, request, this.moment())),
    );
  }

  withdraw(request: { readonly id: string; readonly reason: string }): Promise<AppUpdateChange> {
    return this.changing(() =>
      updateIndex(this.layout, (index) => withdrawEntry(index, request, this.moment())),
    );
  }

  async prune(): Promise<AppUpdatePruned> {
    const removed = await pruneBlobs(this.layout);
    this.log.info('app_update.pruned', { removed: removed.length });
    return { removed: [...removed] };
  }

  private moment(): { readonly id: string; readonly now: Date } {
    return { id: randomUUID(), now: this.now() };
  }

  private async changing<T>(run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      await this.folder.refresh();
      return result;
    } catch (cause) {
      throw refusal(cause);
    }
  }
}

export function appUpdateUploadRoute(store: Store, publisher: AppUpdatePublisher): RawRoute {
  return {
    method: 'PUT',
    path: APP_UPDATE_BLOB_UPLOAD_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'owner', false);
      assertOwnerRoute(store, caller, {
        access: 'owner',
        method: 'PUT',
        path: APP_UPDATE_BLOB_UPLOAD_PATH,
      });
      const sha256 = APP_UPDATE_FILE.shape.sha256.safeParse(params['sha256']);
      if (!sha256.success) {
        throw new ApiError(
          'invalid_request',
          'An app update file is named by 64 lowercase hexadecimal characters.',
        );
      }
      sendJson(response, 200, await publisher.stage(sha256.data, request));
    },
  };
}

type PublicationEndpointName =
  | 'publishAppUpdate'
  | 'promoteAppUpdate'
  | 'rollbackAppUpdate'
  | 'withdrawAppUpdate'
  | 'pruneAppUpdateBlobs';

export function appUpdatePublicationEndpoints(
  publisher: AppUpdatePublisher,
): Required<Pick<ExtensionRouteTable, PublicationEndpointName>> {
  return {
    publishAppUpdate: bound(E.publishAppUpdate, ({ body }) => publisher.publish(body)),
    promoteAppUpdate: bound(E.promoteAppUpdate, ({ body }) => publisher.promote(body)),
    rollbackAppUpdate: bound(E.rollbackAppUpdate, ({ body }) => publisher.rollback(body)),
    withdrawAppUpdate: bound(E.withdrawAppUpdate, ({ body }) => publisher.withdraw(body)),
    pruneAppUpdateBlobs: bound(E.pruneAppUpdateBlobs, () => publisher.prune()),
  };
}
