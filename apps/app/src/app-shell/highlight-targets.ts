import type { NavTarget } from '@smarteverything/domain';
import { anchorKey } from '../components/highlight-keys';
import { settingTargetOf } from './nav-targets';

type Kind = NavTarget['kind'];

type Of<K extends Kind> = Extract<NavTarget, { readonly kind: K }>;

type Keys<K extends Kind> = (target: Of<K>, focus: string | null) => readonly string[];

const NONE = (): readonly string[] => [];

const KEYS: { readonly [K in Kind]: Keys<K> } = {
  section: (target) => [anchorKey.nav(`section:${target.section}`)],
  nav: (target) => [anchorKey.nav(target.node)],
  setting: (target, focus) => {
    const row = focus ?? settingTargetOf(target)?.row ?? null;
    return row === null ? [] : [anchorKey.setting(row)];
  },
  device: (target, focus) => [
    focus === null ? anchorKey.tile(target.deviceId) : anchorKey.capability(target.deviceId, focus),
  ],
  automation: (_target, focus) => (focus === null ? [] : [anchorKey.step(focus)]),
  page: NONE,
  camera: NONE,
  room: NONE,
  group: NONE,
  scene: NONE,
  chat: NONE,
};

function keysFor<K extends Kind>(target: Of<K>, focus: string | null): readonly string[] {
  return KEYS[target.kind](target, focus);
}

export function anchorKeysOf(target: NavTarget, focus: string | null): readonly string[] {
  return keysFor(target, focus);
}
