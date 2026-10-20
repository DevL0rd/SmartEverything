import {
  buttonLabel,
  type CommandAction,
  type IrCodeRow,
  type IrRemoteRow,
} from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';

export interface SceneStep {
  readonly remote: string;
  readonly blasterId: string;
  readonly key: string;
  readonly format: IrCodeRow['format'];
  readonly code: string;
}

export interface SceneGroup {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly SceneStep[];
}

export const SCENE_ICON = 'tv';

export function actionOf(step: SceneStep): CommandAction {
  return {
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

function learnedGroup(remote: IrRemoteRow, codes: readonly IrCodeRow[]): SceneGroup {
  return {
    id: remote.id,
    name: remote.name,
    steps: codes
      .filter((code) => code.remote_id === remote.id)
      .map((code) => ({
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
  return rowsOf(state.tables.ir_remotes)
    .filter((remote) => remote.blaster_id === blasterId)
    .map((remote) => learnedGroup(remote, codes))
    .filter((group) => group.steps.length > 0);
}
