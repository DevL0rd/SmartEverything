import { HEAD_DUE_PERCENT, type BrushStateView } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { BRAND_TEXT } from './brand-text';
import { linkLine } from './brush-model';

export type NoticeAction = 'model' | 'settings';

export interface BrushNotice {
  readonly key: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly body: string;
  readonly action: NoticeAction | null;
}

function linkNotice(view: BrushStateView, now: number): BrushNotice | null {
  const { phase } = view.link;
  const body = linkLine(view, now);
  switch (phase) {
    case 'busy':
      return {
        key: 'busy',
        tone: 'warning',
        title: 'Another app has the brush',
        body,
        action: null,
      };
    case 'needs_pairing':
      return {
        key: 'pairing',
        tone: 'warning',
        title: 'The brush needs pairing',
        body,
        action: 'settings',
      };
    case 'bluetooth_off':
      return { key: 'bluetooth', tone: 'info', title: 'Bluetooth is off', body, action: null };
    case 'asleep':
    case 'searching':
    case 'connecting':
    case 'linked':
      return null;
  }
}

function modelNotice(view: BrushStateView): BrushNotice | null {
  return view.family === 'unknown'
    ? {
        key: 'model',
        tone: 'info',
        title: 'Model not recognised',
        body: 'Choose the model so the right features are shown.',
        action: 'model',
      }
    : null;
}

function batteryNotice(view: BrushStateView): BrushNotice | null {
  const { percent, low, charging } = view.battery;
  return low && !charging && percent !== null
    ? {
        key: 'battery',
        tone: 'warning',
        title: 'Battery is low',
        body: `${String(Math.round(percent))} percent left. Put the brush on its charger.`,
        action: null,
      }
    : null;
}

function headNotice(view: BrushStateView): BrushNotice | null {
  const { head } = view;
  if (head.state === 'unrecognised') {
    return {
      key: 'head',
      tone: 'warning',
      title: 'Brush head not recognised',
      body: `This head is not an original ${BRAND_TEXT[view.profile.brand].maker} head, so wear cannot be counted.`,
      action: null,
    };
  }
  return head.state === 'fitted' && (head.wearPercent ?? 0) >= HEAD_DUE_PERCENT
    ? {
        key: 'head',
        tone: 'warning',
        title: 'Time for a new brush head',
        body: 'The bristles are worn out. A new head cleans better.',
        action: null,
      }
    : null;
}

function faultNotice(view: BrushStateView): BrushNotice | null {
  return view.handle.faultHex === null
    ? null
    : {
        key: 'fault',
        tone: 'critical',
        title: 'The handle reports a fault',
        body: `Error bits ${view.handle.faultHex}. Charge the brush and try again.`,
        action: null,
      };
}

export function noticesOf(view: BrushStateView, now: number): readonly BrushNotice[] {
  return [
    linkNotice(view, now),
    modelNotice(view),
    faultNotice(view),
    batteryNotice(view),
    headNotice(view),
  ].flatMap((notice) => (notice === null ? [] : [notice]));
}
