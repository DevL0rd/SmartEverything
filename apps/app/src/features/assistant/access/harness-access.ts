import type {
  AiHarnessPermission,
  AiPermissionPresetOption,
  AiPermissionPresets,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { rowKey, sectionView, type AccessSectionView } from './access-model';
import type { AccessLevel, AccessOption } from './ai-access';

const PRESET_LEVELS: Readonly<Record<string, AccessLevel>> = {
  'read-only': 'read',
  'workspace-write': 'edits',
  'danger-full-access': 'full',
};

function presetOption(preset: AiPermissionPresetOption): AccessOption {
  return {
    value: preset.value,
    title: preset.name,
    description: preset.description,
    level: PRESET_LEVELS[preset.value] ?? null,
  };
}

export function presetName(presets: AiPermissionPresets | null, sandbox: string): string | null {
  if (presets === null) return null;
  return (presets.options.find((preset) => preset.value === sandbox) ?? presets.custom).name;
}

function offered(permissions: readonly AiHarnessPermission[], sandbox: string): boolean {
  return permissions.some((policy) => policy.sandbox === sandbox);
}

export function harnessSections(
  presets: AiPermissionPresets | null,
  permissions: readonly AiHarnessPermission[],
  current: AiHarnessPermission,
  host: string,
): readonly AccessSectionView[] {
  if (presets === null) return [];
  const known = presets.options.some((preset) => preset.value === current.sandbox);
  const shown = known ? presets.options : [...presets.options, presets.custom];
  const missing = `Not offered by ${host}`;
  return [
    sectionView(
      { id: 'access', title: 'Permissions', options: shown.map(presetOption) },
      known ? current.sandbox : presets.custom.value,
      (option) =>
        (!known && option.value === presets.custom.value) || offered(permissions, option.value)
          ? null
          : missing,
    ),
  ];
}

export function harnessChoice(
  permissions: readonly AiHarnessPermission[],
  current: AiHarnessPermission,
  value: string,
): AiHarnessPermission | null {
  const next = permissions.find((policy) => policy.sandbox === value);
  if (next === undefined) return null;
  return next.sandbox === current.sandbox && next.approval === current.approval ? null : next;
}

export interface HarnessFacts {
  readonly host: string;
  readonly unavailable: string | null;
  readonly sessionReady: boolean;
  readonly applying: boolean;
  readonly waitingConfirm: boolean;
  readonly switching: boolean;
  readonly liveChange: boolean;
  readonly bound: boolean;
  readonly presets: boolean;
  readonly choices: number;
}

export interface AccessBlock {
  readonly kind: 'applying' | 'confirm' | 'blocked';
  readonly icon: IconName;
  readonly text: string;
}

export function harnessBlock(facts: HarnessFacts): AccessBlock | null {
  const { host } = facts;
  if (facts.applying) return { kind: 'applying', icon: 'loader', text: 'Changing access…' };
  if (facts.waitingConfirm)
    return {
      kind: 'confirm',
      icon: 'clock',
      text: `Waiting for ${host} to confirm the last change`,
    };
  if (facts.switching)
    return { kind: 'blocked', icon: 'info', text: 'The chat is moving to another machine' };
  if (facts.unavailable !== null)
    return { kind: 'blocked', icon: 'wifiOff', text: facts.unavailable };
  if (!facts.sessionReady)
    return {
      kind: 'blocked',
      icon: 'clock',
      text: `Waiting for ${host} to start this chat’s session`,
    };
  if (facts.bound && !facts.liveChange)
    return {
      kind: 'blocked',
      icon: 'info',
      text: `Update ${host} to change access in a running chat`,
    };
  if (!facts.presets)
    return { kind: 'blocked', icon: 'clock', text: `Access options for ${host} aren’t loaded yet` };
  if (facts.choices < 2)
    return { kind: 'blocked', icon: 'info', text: `Access can’t be changed on ${host}` };
  return null;
}

export function applyingKey(
  current: AiHarnessPermission,
  target: AiHarnessPermission | undefined,
): string | null {
  if (target === undefined) return null;
  return target.sandbox === current.sandbox ? null : rowKey('access', target.sandbox);
}
