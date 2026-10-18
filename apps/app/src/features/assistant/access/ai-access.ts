import type {
  AiHarnessPermission,
  ClaudeProviderOptions,
  CodexProviderOptions,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type AccessLevel =
  'default' | 'read' | 'edits' | 'plan' | 'auto' | 'full' | 'strict' | 'sandbox' | 'tools';

type AccessTone = 'neutral' | 'caution';

interface AccessLook {
  readonly pill: string;
  readonly icon: IconName;
  readonly tone: AccessTone;
}

export const ACCESS_LEVELS: Readonly<Record<AccessLevel, AccessLook>> = {
  default: { pill: 'Default', icon: 'shield', tone: 'neutral' },
  read: { pill: 'Read only', icon: 'eye', tone: 'neutral' },
  edits: { pill: 'Edits', icon: 'pencilShield', tone: 'neutral' },
  plan: { pill: 'Plan', icon: 'listCheck', tone: 'neutral' },
  auto: { pill: 'Auto', icon: 'shieldCheck', tone: 'neutral' },
  full: { pill: 'Full', icon: 'shieldAlert', tone: 'caution' },
  strict: { pill: 'Strict', icon: 'shieldX', tone: 'neutral' },
  sandbox: { pill: 'Sandbox', icon: 'box', tone: 'neutral' },
  tools: { pill: 'Tools', icon: 'wrench', tone: 'neutral' },
};

export const RUNTIME_DEFAULT = 'runtime-default';

export type AccessEngine = 'harness' | 'claude' | 'codex' | 'cloud';

export interface AccessOption {
  readonly value: string;
  readonly title: string;
  readonly description: string | null;
  readonly level: AccessLevel | null;
}

export interface AccessSection {
  readonly id: string;
  readonly title: string;
  readonly options: readonly AccessOption[];
}

type RuntimeDefault = typeof RUNTIME_DEFAULT;
type ClaudeMode = NonNullable<ClaudeProviderOptions['permission_mode']>;
type CodexApproval = Extract<NonNullable<CodexProviderOptions['approval_policy']>, string>;
type CodexSandbox = NonNullable<CodexProviderOptions['sandbox_policy']>['type'];

function option(
  value: string,
  title: string,
  description: string | null,
  level: AccessLevel | null,
): AccessOption {
  return { value, title, description, level };
}

const RUNTIME = option(RUNTIME_DEFAULT, 'Runtime default', null, 'default');
const READ = option('read-only', 'Read only', 'Looks, doesn’t change anything', 'read');
const EDITS = option(
  'workspace-write',
  'Allow edits',
  'Edits files in the folder, runs everyday commands',
  'edits',
);
const FULL = option('danger-full-access', 'Full access', 'Anything your account can do', 'full');
const ASK_FIRST = option('untrusted', 'Ask first', 'Before anything that changes', null);
const ASK_NEEDED = option('on-request', 'Ask when needed', 'When it wants more access', null);
const NEVER_ASK = option('never', 'Never ask', 'Works without stopping', null);

const HARNESS: readonly AccessSection[] = [
  { id: 'access', title: 'What it can change', options: [READ, EDITS, FULL] },
  { id: 'asking', title: 'When it asks', options: [ASK_NEEDED, NEVER_ASK] },
];

const CLAUDE_MODES: Readonly<Record<RuntimeDefault | ClaudeMode, AccessOption>> = {
  [RUNTIME_DEFAULT]: RUNTIME,
  default: option('default', 'Ask first', 'Before anything that changes', 'default'),
  acceptEdits: option('acceptEdits', 'Allow edits', EDITS.description, 'edits'),
  plan: option('plan', 'Plan only', 'Plans first, changes nothing until you approve', 'plan'),
  auto: option('auto', 'Automatic approvals', 'Approves routine actions itself', 'auto'),
  bypassPermissions: option('bypassPermissions', 'Full access', FULL.description, 'full'),
  dontAsk: option('dontAsk', 'Decline unapproved actions', 'Says no instead of asking', 'strict'),
};

const CODEX_ACCESS: Readonly<Record<RuntimeDefault | CodexSandbox, AccessOption>> = {
  [RUNTIME_DEFAULT]: RUNTIME,
  readOnly: option('readOnly', 'Read only', READ.description, 'read'),
  workspaceWrite: option('workspaceWrite', 'Allow edits', EDITS.description, 'edits'),
  dangerFullAccess: option('dangerFullAccess', 'Full access', FULL.description, 'full'),
  externalSandbox: option(
    'externalSandbox',
    'External sandbox',
    'Another sandbox controls access',
    'sandbox',
  ),
};

const CODEX_APPROVALS: Readonly<Record<RuntimeDefault | CodexApproval, AccessOption>> = {
  [RUNTIME_DEFAULT]: option(RUNTIME_DEFAULT, 'Runtime default', null, null),
  untrusted: ASK_FIRST,
  'on-request': ASK_NEEDED,
  never: option('never', 'No prompts', NEVER_ASK.description, null),
};

function listed(record: Readonly<Record<string, AccessOption>>): readonly AccessOption[] {
  return Object.values(record);
}

const SECTIONS: Readonly<Record<AccessEngine, readonly AccessSection[]>> = {
  harness: HARNESS,
  claude: [{ id: 'mode', title: 'Mode', options: listed(CLAUDE_MODES) }],
  codex: [
    { id: 'access', title: 'Access', options: listed(CODEX_ACCESS) },
    { id: 'approvals', title: 'Approvals', options: listed(CODEX_APPROVALS) },
  ],
  cloud: [],
};

export function accessSections(engine: AccessEngine): readonly AccessSection[] {
  return SECTIONS[engine];
}

export type AccessSelection =
  | { readonly kind: 'harness'; readonly permission: AiHarnessPermission }
  | { readonly kind: 'claude'; readonly mode: ClaudeProviderOptions['permission_mode'] }
  | {
      readonly kind: 'codex';
      readonly sandbox: CodexProviderOptions['sandbox_policy'];
      readonly approval: CodexProviderOptions['approval_policy'];
    }
  | { readonly kind: 'cloud'; readonly allowedTools: number };

export interface AccessPill {
  readonly level: AccessLevel;
  readonly label: string;
  readonly title: string;
  readonly icon: IconName;
  readonly tone: AccessTone;
  readonly asking: string | null;
}

const HARNESS_ASKING: Readonly<Record<CodexApproval, string>> = {
  untrusted: 'asks first',
  'on-request': 'asks when needed',
  never: 'never asks',
};

function codexAsking(policy: CodexProviderOptions['approval_policy']): string | null {
  if (policy === undefined) return null;
  return typeof policy === 'string' ? HARNESS_ASKING[policy] : 'asks by custom rules';
}

function levelOf(opt: AccessOption): AccessLevel {
  return opt.level ?? 'default';
}

function pillOf(opt: AccessOption, asking: string | null): AccessPill {
  const level = levelOf(opt);
  const look = ACCESS_LEVELS[level];
  return { level, label: look.pill, title: opt.title, icon: look.icon, tone: look.tone, asking };
}

const HARNESS_ACCESS: Readonly<Record<AiHarnessPermission['sandbox'], AccessOption>> = {
  'read-only': READ,
  'workspace-write': EDITS,
  'danger-full-access': FULL,
};

export function accessPill(selection: AccessSelection): AccessPill {
  switch (selection.kind) {
    case 'harness':
      return pillOf(
        HARNESS_ACCESS[selection.permission.sandbox],
        HARNESS_ASKING[selection.permission.approval],
      );
    case 'claude':
      return pillOf(CLAUDE_MODES[selection.mode ?? RUNTIME_DEFAULT], null);
    case 'codex':
      return pillOf(
        CODEX_ACCESS[selection.sandbox?.type ?? RUNTIME_DEFAULT],
        codexAsking(selection.approval),
      );
    case 'cloud':
      return {
        level: 'tools',
        label: `Tools ${String(selection.allowedTools)}`,
        title: 'Tools for this chat',
        icon: ACCESS_LEVELS.tools.icon,
        tone: 'neutral',
        asking: null,
      };
  }
}

export function accessPillLabel(pill: AccessPill, nextTurn: boolean): string {
  const asking = pill.asking === null ? '' : `, ${pill.asking}`;
  const later = nextTurn ? ', applies next turn' : '';
  return `Access: ${pill.title}${asking}${later}`;
}

const FOOTNOTE = {
  restart: 'Applies when the session restarts',
  codex: 'Applies next turn',
  next: 'Applies to the next action',
} as const;

export function accessFootnote(engine: AccessEngine, restart: boolean): string {
  if (restart) return FOOTNOTE.restart;
  return engine === 'codex' ? FOOTNOTE.codex : FOOTNOTE.next;
}
