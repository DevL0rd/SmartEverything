import type { AiHarnessPermission } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { rowKey, sectionById, sectionView, type AccessSectionView } from './access-model';
import { accessSections } from './ai-access';

export function harnessSections(
  permissions: readonly AiHarnessPermission[],
  current: AiHarnessPermission,
  host: string,
): readonly AccessSectionView[] {
  const sections = accessSections('harness');
  const missing = `Not offered by ${host}`;
  return [
    sectionView(sectionById(sections, 'access'), current.sandbox, (option) =>
      permissions.some((policy) => policy.sandbox === option.value) ? null : missing,
    ),
    sectionView(sectionById(sections, 'asking'), current.approval, (option) =>
      permissions.some(
        (policy) => policy.sandbox === current.sandbox && policy.approval === option.value,
      )
        ? null
        : missing,
    ),
  ];
}

export function harnessChoice(
  permissions: readonly AiHarnessPermission[],
  current: AiHarnessPermission,
  sectionId: string,
  value: string,
): AiHarnessPermission | null {
  const next =
    sectionId === 'access'
      ? (permissions.find(
          (policy) => policy.sandbox === value && policy.approval === current.approval,
        ) ?? permissions.find((policy) => policy.sandbox === value))
      : permissions.find(
          (policy) => policy.sandbox === current.sandbox && policy.approval === value,
        );
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
  if (facts.choices < 2)
    return { kind: 'blocked', icon: 'info', text: `Access can’t be changed on ${host}` };
  return null;
}

export function applyingKey(
  current: AiHarnessPermission,
  target: AiHarnessPermission | undefined,
): string | null {
  if (target === undefined) return null;
  if (target.sandbox !== current.sandbox) return rowKey('access', target.sandbox);
  return target.approval === current.approval ? null : rowKey('asking', target.approval);
}
