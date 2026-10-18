import { EMPTY_IR_REMOTE_STATE, type IrRemoteState } from '@smarteverything/domain';
import { updateIrRemote } from '../../../api/ir';
import { notifyFailure } from '../../../components/toast-store';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';

export function useAssumed(remoteId: string): IrRemoteState {
  return useStoreSelector(
    (state) => state.settings?.ir_remotes[remoteId] ?? EMPTY_IR_REMOTE_STATE,
    sameJson,
    [remoteId],
  );
}

export function markRemote(remoteId: string, on: boolean): void {
  updateIrRemote(remoteId, { on }).catch(notifyFailure('The remote was not marked'));
}

export function setCheck(remoteId: string, deviceId: string | null): void {
  updateIrRemote(remoteId, { checkDeviceId: deviceId }).catch(
    notifyFailure('The check device was not saved'),
  );
}
