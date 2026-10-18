import { deviceFamily } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { compareText } from '../../../format/text';

export interface HubChild {
  readonly id: string;
  readonly kind: Device['kind'];
  readonly model: string;
  readonly name: string;
  readonly online: boolean;
  readonly button: boolean;
}

export interface HubView {
  readonly children: readonly HubChild[];
  readonly online: number;
}

export function hubViewOf(devices: readonly Device[], hubId: string): HubView {
  const children = devices
    .filter((device) => device.parent_id === hubId)
    .map((device) => ({
      id: device.id,
      kind: device.kind,
      model: device.model,
      name: device.label,
      online: device.online,
      button: deviceFamily(device) === 'button',
    }))
    .sort((left, right) => compareText(left.name, right.name));
  return { children, online: children.filter((child) => child.online).length };
}

export function childNoun(view: HubView): string {
  const buttons = view.children.every((child) => child.button);
  const count = view.children.length;
  if (buttons) {
    return count === 1 ? 'button' : 'buttons';
  }
  return count === 1 ? 'device' : 'devices';
}

export function hubLine(view: HubView, online: boolean): string {
  if (!online) {
    return 'Offline. Its buttons can’t be heard.';
  }
  const count = view.children.length;
  if (count === 0) {
    return 'No devices connected yet';
  }
  const heard = `Hears ${String(count)} ${childNoun(view)}`;
  const offline = count - view.online;
  return offline === 0 ? `${heard} · all online` : `${heard} · ${String(offline)} offline`;
}
