import type { IconName } from '../../../components/icon';

export type MenuKey =
  'wake' | 'restart' | 'shut_down' | 'sign_out' | 'hibernate' | 'pair' | 'revoke';

interface MenuConfirm {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly destructive: boolean;
}

export interface MenuEntry {
  readonly key: MenuKey;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive: boolean;
  readonly confirm: MenuConfirm | null;
}

export interface MenuInput {
  readonly name: string;
  readonly offline: boolean;
  readonly offers: (capability: string) => boolean;
  readonly owner: boolean;
  readonly canRevoke: boolean;
  readonly hub: boolean;
}

const UNSAVED = 'Unsaved work in open apps may be lost.';
const HUB_WARNING = 'This computer runs the hub, so everything that depends on it stops too.';

interface PowerSpec {
  readonly key: Extract<MenuKey, 'restart' | 'shut_down' | 'sign_out' | 'hibernate'>;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive: boolean;
  readonly title: (name: string) => string;
  readonly body: (name: string) => string;
  readonly confirmLabel: string;
}

const POWER_SPECS: readonly PowerSpec[] = [
  {
    key: 'restart',
    label: 'Restart…',
    icon: 'refresh',
    destructive: true,
    title: (name) => `Restart ${name}?`,
    body: () => UNSAVED,
    confirmLabel: 'Restart',
  },
  {
    key: 'shut_down',
    label: 'Shut down…',
    icon: 'power',
    destructive: true,
    title: (name) => `Shut down ${name}?`,
    body: () => `${UNSAVED} You can start it again with Wake if it supports it.`,
    confirmLabel: 'Shut down',
  },
  {
    key: 'sign_out',
    label: 'Sign out…',
    icon: 'signOut',
    destructive: true,
    title: (name) => `Sign out of ${name}?`,
    body: () => UNSAVED,
    confirmLabel: 'Sign out',
  },
  {
    key: 'hibernate',
    label: 'Hibernate…',
    icon: 'moon',
    destructive: false,
    title: (name) => `Hibernate ${name}?`,
    body: (name) => `${name} goes away for a few minutes while it saves its state.`,
    confirmLabel: 'Hibernate',
  },
];

function powerEntries(input: MenuInput): readonly MenuEntry[] {
  const { name, offers, hub } = input;
  return POWER_SPECS.filter((spec) => offers(spec.key)).map((spec) => ({
    key: spec.key,
    label: spec.label,
    icon: spec.icon,
    destructive: spec.destructive,
    confirm: {
      title: spec.title(name),
      body: hub ? `${HUB_WARNING} ${spec.body(name)}` : spec.body(name),
      confirmLabel: spec.confirmLabel,
      destructive: spec.destructive,
    },
  }));
}

export function menuEntries(input: MenuInput): readonly MenuEntry[] {
  const { name, offline, offers, owner, canRevoke } = input;
  const wake: MenuEntry = {
    key: 'wake',
    label: 'Wake',
    icon: 'power',
    destructive: false,
    confirm: null,
  };
  const pair: MenuEntry = {
    key: 'pair',
    label: 'Pair another computer',
    icon: 'plus',
    destructive: false,
    confirm: null,
  };
  const revoke: MenuEntry = {
    key: 'revoke',
    label: 'Revoke connection…',
    icon: 'trash',
    destructive: true,
    confirm: {
      title: `Revoke ${name}’s connection?`,
      body: `${name} stops working with this hub until you pair it again. Its chats stay readable.`,
      confirmLabel: 'Revoke connection',
      destructive: true,
    },
  };
  const power = offline ? (offers('wake') ? [wake] : []) : powerEntries(input);
  return [...power, ...(owner ? [pair] : []), ...(owner && canRevoke ? [revoke] : [])];
}
