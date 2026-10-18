import { buttonLabel, type IrRemoteState } from '@smarteverything/domain';
import type { Tone } from '../../../components/tone';
import { cardTime } from '../log/log-model';
import type { Confirmation } from './confirmation';

type ChipTone = 'info' | 'positive' | 'critical' | 'neutral';

export interface RemoteChip {
  readonly label: string;
  readonly tone: ChipTone;
}

export interface RemoteStatus {
  readonly online: boolean;
  readonly blasterName: string;
  readonly assumed: IrRemoteState;
  readonly confirmation: Confirmation | null;
  readonly failure: string | null;
}

export function effectiveOn(status: RemoteStatus): boolean | null {
  return status.confirmation === null ? status.assumed.on : status.confirmation.on;
}

export function chipOf(status: RemoteStatus): RemoteChip {
  if (!status.online) {
    return { label: 'Offline', tone: 'neutral' };
  }
  if (status.failure !== null) {
    return { label: 'Not sent', tone: 'critical' };
  }
  if (status.confirmation !== null) {
    return { label: `Confirmed by ${status.confirmation.by}`, tone: 'positive' };
  }
  const on = status.assumed.on;
  if (on === null) {
    return { label: 'Not sent yet', tone: 'neutral' };
  }
  return { label: on ? 'Assumed' : 'Assumed off', tone: on ? 'info' : 'neutral' };
}

export interface RemoteLine {
  readonly text: string;
  readonly tone: Tone;
}

function lastSent(assumed: IrRemoteState): string {
  return assumed.sentKey === null || assumed.sentAt === null
    ? 'IR can’t report back'
    : `Sent ${buttonLabel(assumed.sentKey)} ${cardTime(assumed.sentAt)}`;
}

export function lineOf(status: RemoteStatus): RemoteLine {
  const { assumed, confirmation } = status;
  if (confirmation !== null && status.online) {
    return {
      text: `${confirmation.on ? 'Drawing' : 'Idle at'} ${String(Math.round(confirmation.watts))} W`,
      tone: 'variant',
    };
  }
  return { text: lastSent(assumed), tone: 'variant' };
}

export function failureOf(status: RemoteStatus): RemoteLine | null {
  return status.failure === null ? null : { text: status.failure, tone: 'critical' };
}

export function failureText(online: boolean, blasterName: string): string {
  return online ? `Not sent: ${blasterName} didn’t answer` : `Not sent: ${blasterName} is offline`;
}
