import {
  buttonLabel,
  type CommandAction,
  type IrCodeRow,
  type IrRemoteRow,
} from '@smarteverything/domain';
import type { Device, StoreState } from '../../../store/state';
import { rowsOf } from '../../../store/state';
import { remoteKeysOf } from '../model/remote-layout';

export type SceneStep =
  | {
      readonly kind: 'library';
      readonly remote: string;
      readonly deviceId: string;
      readonly key: string;
    }
  | {
      readonly kind: 'learned';
      readonly remote: string;
      readonly blasterId: string;
      readonly key: string;
      readonly format: IrCodeRow['format'];
      readonly code: string;
    };

export interface SceneGroup {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly SceneStep[];
}

export const SCENE_ICON = 'tv';

export function actionOf(step: SceneStep): CommandAction {
  return step.kind === 'library'
    ? { type: 'command', deviceId: step.deviceId, capability: 'remote_key', value: step.key }
    : {
        type: 'command',
        deviceId: step.blasterId,
        capability: 'ir_send',
        value: { format: step.format, code: step.code },
      };
}

export function stepLabel(step: SceneStep): string {
  return `${step.remote} · ${buttonLabel(step.key)}`;
}

export function sceneReady(name: string, steps: readonly SceneStep[]): boolean {
  return name.trim() !== '' && steps.length > 0;
}

function libraryGroup(device: Device): SceneGroup {
  return {
    id: device.id,
    name: device.label,
    steps: remoteKeysOf(device.capabilities).map((key) => ({
      kind: 'library',
      remote: device.label,
      deviceId: device.id,
      key,
    })),
  };
}

function learnedGroup(remote: IrRemoteRow, codes: readonly IrCodeRow[]): SceneGroup {
  return {
    id: remote.id,
    name: remote.name,
    steps: codes
      .filter((code) => code.remote_id === remote.id)
      .map((code) => ({
        kind: 'learned',
        remote: remote.name,
        blasterId: remote.blaster_id,
        key: code.button,
        format: code.format,
        code: code.code,
      })),
  };
}

export function sceneGroupsOf(state: StoreState, blasterId: string): readonly SceneGroup[] {
  const codes = rowsOf(state.tables.ir_codes);
  const library = rowsOf(state.tables.devices)
    .filter((device) => device.kind === 'ir_remote' && device.parent_id === blasterId)
    .map(libraryGroup);
  const learned = rowsOf(state.tables.ir_remotes)
    .filter((remote) => remote.blaster_id === blasterId)
    .map((remote) => learnedGroup(remote, codes));
  return [...library, ...learned].filter((group) => group.steps.length > 0);
}
