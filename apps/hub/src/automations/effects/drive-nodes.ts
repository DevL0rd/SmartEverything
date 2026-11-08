import {
  ApiError,
  type DriveChange,
  type DriveChangeResult,
  type DriveVia,
} from '@smarteverything/domain';
import { z } from 'zod';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { DriveCaller } from '../../drive/service-write-support';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import type { EffectHandler, EffectHandlers } from './effect-run';
import { awaitRun } from './run-abort';

export interface DriveEffectPorts {
  readonly drive: {
    readonly change: (caller: DriveCaller, change: DriveChange) => Promise<DriveChangeResult>;
  };
  readonly ownerProfileId: () => string;
}

export class DriveNotReadyError extends Error {
  constructor() {
    super('The drive isn’t running on this server yet, so this step couldn’t run.');
  }
}

export class AutomationDriveSlot {
  private source: DriveEffectPorts['drive'] | null = null;

  attach(source: DriveEffectPorts['drive']): void {
    this.source = source;
  }

  stop(): void {
    this.source = null;
  }

  current(): DriveEffectPorts['drive'] {
    if (this.source === null) throw new DriveNotReadyError();
    return this.source;
  }
}

const VIA: DriveVia = 'automation';

const ADD_TO_ALBUM = z.object({ item: z.uuid(), album: z.uuid() });

const KEEP = z.object({ item: z.uuid(), folder: z.uuid() });

function callerOf(ports: DriveEffectPorts): DriveCaller {
  const authority = currentExecutionAuthority();
  if (authority === undefined) {
    return { profileId: ports.ownerProfileId(), owner: true, via: VIA, deviceId: null };
  }
  return {
    profileId: authority.profile_id,
    owner: executionRole(authority) === 'owner',
    via: VIA,
    deviceId: null,
  };
}

function refusal(result: DriveChangeResult): ApiError | undefined {
  const failed = result.failed[0];
  if (failed !== undefined) {
    return new ApiError('invalid_request', failed.reason);
  }
  const clash = result.conflicts[0];
  if (clash !== undefined) {
    return new ApiError('conflict', `${clash.name} already exists in that folder.`);
  }
  return undefined;
}

async function applied(
  ports: DriveEffectPorts,
  run: Parameters<EffectHandler>[2],
  change: DriveChange,
): Promise<DriveChangeResult> {
  const result = await awaitRun(ports.drive.change(callerOf(ports), change), run);
  const refused = refusal(result);
  if (refused !== undefined) {
    throw refused;
  }
  return result;
}

function addToAlbum(ports: DriveEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(ADD_TO_ALBUM, params);
    if (!checked.ok) return checked;
    try {
      await applied(ports, run, {
        action: 'album_add',
        albumId: checked.value.album,
        itemIds: [checked.value.item],
      });
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function keep(ports: DriveEffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(KEEP, params);
    if (!checked.ok) return checked;
    try {
      const result = await applied(ports, run, {
        action: 'keep_source_item',
        itemId: checked.value.item,
        toFolderId: checked.value.folder,
      });
      const kept = result.done[0]?.resultItemId;
      if (kept === null || kept === undefined) {
        throw new ApiError('internal', 'The hub reported no kept copy.');
      }
      return { ok: true, value: outputs({ itemId: kept }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function driveEffects(ports: DriveEffectPorts): EffectHandlers {
  return {
    'drive.add_to_album': addToAlbum(ports),
    'drive.keep': keep(ports),
  };
}
