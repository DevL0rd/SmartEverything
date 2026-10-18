import { MessageType, type Message } from '@jellybrick/dbus-next';
import { z } from 'zod';
import type { FreePosition } from './overlay-placement.js';

export const READY_NAME = 'org.smarteverything.Overlay';
export const READY_PATH = '/overlay';

export type KwinEvent =
  | { readonly kind: 'ready' }
  | { readonly kind: 'fullscreen'; readonly active: boolean }
  | { readonly kind: 'moved'; readonly free: FreePosition };

const FULLSCREEN_BODY = z.tuple([z.boolean()]);
const MOVED_BODY = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

export function kwinEventOf(message: Message): KwinEvent | null {
  if (
    message.type !== MessageType.METHOD_CALL ||
    message.path !== READY_PATH ||
    message.interface !== READY_NAME
  ) {
    return null;
  }
  if (message.member === 'Ready') {
    return { kind: 'ready' };
  }
  if (message.member === 'Fullscreen') {
    const body = FULLSCREEN_BODY.safeParse(message.body);
    return body.success ? { kind: 'fullscreen', active: body.data[0] } : null;
  }
  if (message.member === 'Moved') {
    const body = MOVED_BODY.safeParse(message.body);
    return body.success ? { kind: 'moved', free: { cx: body.data[0], cy: body.data[1] } } : null;
  }
  return null;
}
