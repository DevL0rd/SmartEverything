import type { AudioChange, DisplayChange, SystemToolChange } from '@smarteverything/domain';
import { clockText } from './computer-compact';

export function audioSummary(change: AudioChange): string {
  const target = (device: string | undefined, kind: string): string =>
    device ?? `The default ${kind}`;
  switch (change.action) {
    case 'volume':
      return `${target(change.device, change.kind)} volume set to ${String(change.level)} %`;
    case 'mute':
      return `${target(change.device, change.kind)} ${change.muted ? 'muted' : 'unmuted'}`;
    case 'default':
      return `${change.device} is now the default ${change.kind}`;
    case 'app_volume':
      return `${change.app} set to ${String(change.level)} %`;
    case 'app_mute':
      return `${change.app} ${change.muted ? 'muted' : 'unmuted'}`;
    case 'app_output':
      return `${change.app} now plays on ${change.output}`;
  }
}

type LayoutChange = Extract<
  DisplayChange,
  { action: 'enable' | 'disable' | 'primary' | 'mode' | 'scale' | 'rotation' }
>;

type SettingChange = Extract<
  SystemToolChange,
  { action: 'power_mode' | 'dnd' | 'keyboard_layout' | 'wifi' | 'wifi_connect' }
>;

const LAYOUT_ACTIONS: ReadonlySet<string> = new Set([
  'enable',
  'disable',
  'primary',
  'mode',
  'scale',
  'rotation',
]);

const SETTING_ACTIONS: ReadonlySet<string> = new Set([
  'power_mode',
  'dnd',
  'keyboard_layout',
  'wifi',
  'wifi_connect',
]);

function isLayout(change: DisplayChange): change is LayoutChange {
  return LAYOUT_ACTIONS.has(change.action);
}

function isSetting(change: SystemToolChange): change is SettingChange {
  return SETTING_ACTIONS.has(change.action);
}

export function displaySummary(change: DisplayChange): string {
  return isLayout(change) ? layoutSummary(change) : placementSummary(change);
}

export function systemSummary(change: SystemToolChange): string {
  return isSetting(change) ? settingSummary(change) : linkSummary(change);
}

function onOff(on: boolean): string {
  return on ? 'on' : 'off';
}

function resolution(change: Extract<DisplayChange, { action: 'mode' }>): string {
  const rate = change.refreshHz === undefined ? '' : `@${String(change.refreshHz)}`;
  return `${change.output} set to ${String(change.width)}x${String(change.height)}${rate}`;
}

function layoutSummary(change: LayoutChange): string {
  switch (change.action) {
    case 'enable':
    case 'disable':
    case 'primary':
      return `${change.output}: ${change.action}`;
    case 'mode':
      return resolution(change);
    case 'scale':
      return `${change.output} scale set to ${String(change.percent)} %`;
    case 'rotation':
      return `${change.output} rotated to ${String(change.degrees)} degrees`;
  }
}

function placementSummary(change: Exclude<DisplayChange, LayoutChange>): string {
  switch (change.action) {
    case 'position':
      return `${change.output} placed ${change.side} ${change.relativeTo}`;
    case 'mirror':
      return `${change.output} ${change.of === null ? 'no longer mirrors' : `mirrors ${change.of}`}`;
    case 'brightness':
      return `${change.output ?? 'Brightness'} set to ${String(change.level)} %`;
    case 'hdr':
      return `${change.output} HDR ${onOff(change.enabled)}`;
    case 'vrr':
      return `${change.output} adaptive sync ${change.policy}`;
    case 'night_light':
      return `Night light ${change.mode}`;
    case 'identify':
      return 'Screens identified';
  }
}

export function revertNote(revertsAt: string | null): string {
  return revertsAt === null ? '' : `. Reverts at ${clockText(revertsAt)} unless kept`;
}

function settingSummary(change: SettingChange): string {
  switch (change.action) {
    case 'power_mode':
      return `Power mode set to ${change.mode}`;
    case 'dnd':
      return `Do Not Disturb ${onOff(change.enabled)}`;
    case 'keyboard_layout':
      return `Keyboard layout set to ${change.layout}`;
    case 'wifi':
      return `Wi-Fi ${onOff(change.enabled)}`;
    case 'wifi_connect':
      return `Connecting to ${change.network}`;
  }
}

function linkSummary(change: Exclude<SystemToolChange, SettingChange>): string {
  switch (change.action) {
    case 'bluetooth':
      return `Bluetooth ${onOff(change.enabled)}`;
    case 'bluetooth_device':
      return `${change.device} ${change.connected ? 'connected' : 'disconnected'}`;
    case 'startup_app':
      return `${change.id} ${change.enabled ? 'starts' : 'no longer starts'} at sign-in`;
    case 'service':
      return `${change.unit}: ${change.operation}`;
  }
}
