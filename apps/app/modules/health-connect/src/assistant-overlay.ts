import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  OVERLAY_SIMPLE_ACTIONS,
  type OverlayAction,
  type OverlayPhonePrefs,
} from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

export const OVERLAY_STATUS = z.strictObject({
  host: z.enum(['session', 'window', 'none']),
  assistantRole: z.boolean(),
  canDrawOverlays: z.boolean(),
  batteryUnrestricted: z.boolean(),
});

export type OverlayStatus = z.infer<typeof OVERLAY_STATUS>;

const OVERLAY_ACTION_EVENT = z.strictObject({ action: z.enum(OVERLAY_SIMPLE_ACTIONS) });

declare class AssistantOverlayNative extends NativeModule<{
  readonly onOverlayAction: (payload: unknown) => void;
}> {
  overlayStatus(): unknown;
  openOverlaySettings(): Promise<void>;
  openAssistantSettings(): Promise<void>;
  setOverlayPrefs(json: string): Promise<void>;
  showAssistantSession(): Promise<boolean>;
}

type OverlayName =
  | 'overlayStatus'
  | 'openOverlaySettings'
  | 'openAssistantSettings'
  | 'setOverlayPrefs'
  | 'showAssistantSession'
  | 'addListener';

const native = requireOptionalNativeModule<AssistantOverlayNative>('AssistantCall');

function overlayFor(operation: OverlayName): AssistantOverlayNative {
  if (native === null || typeof Reflect.get(native, operation) !== 'function') {
    throw new AppUpdateNeededError(`the call bar (${operation})`);
  }
  return native;
}

export function overlayLinked(): boolean {
  return native !== null && typeof Reflect.get(native, 'overlayStatus') === 'function';
}

export function overlayStatus(): OverlayStatus {
  return OVERLAY_STATUS.parse(overlayFor('overlayStatus').overlayStatus());
}

export async function openOverlaySettings(): Promise<void> {
  await overlayFor('openOverlaySettings').openOverlaySettings();
}

export async function openAssistantSettings(): Promise<void> {
  await overlayFor('openAssistantSettings').openAssistantSettings();
}

export async function setOverlayPrefs(prefs: OverlayPhonePrefs): Promise<void> {
  await overlayFor('setOverlayPrefs').setOverlayPrefs(JSON.stringify(prefs));
}

export async function showAssistantSession(): Promise<boolean> {
  return overlayFor('showAssistantSession').showAssistantSession();
}

export function addOverlayActionListener(listener: (action: OverlayAction) => void): {
  readonly remove: () => void;
} {
  const subscription = overlayFor('addListener').addListener('onOverlayAction', (payload) => {
    listener({ kind: OVERLAY_ACTION_EVENT.parse(payload).action });
  });
  return {
    remove: (): void => {
      subscription.remove();
    },
  };
}
