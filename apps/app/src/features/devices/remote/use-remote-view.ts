import type { IrRemoteState } from '@smarteverything/domain';
import { useConfirmation, type Confirmation } from './confirmation';
import { controlsFor, type RemoteControlSet } from './remote-controls';
import {
  chipOf,
  effectiveOn,
  failureOf,
  lineOf,
  type RemoteChip,
  type RemoteLine,
  type RemoteStatus,
} from './remote-lines';
import type { RemoteSource } from './remote-source';
import type { RemoteLook } from './remote-visual';
import { useAssumed } from './use-assumed';
import { useRemoteSend } from './use-remote-send';

export interface RemoteView {
  readonly controls: RemoteControlSet;
  readonly assumed: IrRemoteState;
  readonly confirmation: Confirmation | null;
  readonly press: (key: string) => void;
  readonly chip: RemoteChip;
  readonly line: RemoteLine;
  readonly failure: RemoteLine | null;
  readonly on: boolean | null;
  readonly blocked: string | null;
  readonly empty: boolean;
  readonly look: RemoteLook;
}

function blockedBy(source: RemoteSource): string | null {
  return source.online ? null : `${source.blasterName} is offline. Nothing can be sent.`;
}

export function useRemoteView(source: RemoteSource): RemoteView {
  const controls = controlsFor(source.category, source.keys);
  const assumed = useAssumed(source.id);
  const confirmation = useConfirmation(assumed.checkDeviceId);
  const send = useRemoteSend(source);
  const status: RemoteStatus = {
    online: source.online,
    blasterName: source.blasterName,
    assumed,
    confirmation,
    failure: send.failure,
  };
  const on = effectiveOn(status);
  return {
    controls,
    assumed,
    confirmation,
    press: send.press,
    chip: chipOf(status),
    line: lineOf(status),
    failure: failureOf(status),
    on,
    blocked: blockedBy(source),
    empty: source.keys.length === 0,
    look: {
      on,
      assumed: confirmation === null,
      failed: send.failure !== null,
      sentAt: assumed.sentAt,
    },
  };
}
