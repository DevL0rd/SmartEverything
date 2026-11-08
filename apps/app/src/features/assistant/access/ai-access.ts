import type {
  AiHarnessPermission,
  ClaudeProviderOptions,
  CodexProviderOptions,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type AccessLevel =
  'runtime' | 'ask' | 'read' | 'edits' | 'plan' | 'auto' | 'full' | 'strict' | 'sandbox';

type AccessTone = 'neutral' | 'caution';

interface AccessLook {
  readonly pill: string;
  readonly icon: IconName;
  readonly tone: AccessTone;
}

export const ACCESS_LEVELS: Readonly<Record<AccessLevel, AccessLook>> = {
  runtime: { pill: 'Runtime', icon: 'shield', tone: 'neutral' },
  ask: { pill: 'Ask', icon: 'shield', tone: 'neutral' },
  read: { pill: 'Read only', icon: 'eye', tone: 'neutral' },
  edits: { pill: 'Edits', icon: 'pencilShield', tone: 'neutral' },
  plan: { pill: 'Plan', icon: 'listCheck', tone: 'neutral' },
  auto: { pill: 'Auto', icon: 'shieldCheck', tone: 'neutral' },
  full: { pill: 'Full', icon: 'shieldAlert', tone: 'caution' },
  strict: { pill: 'Strict', icon: 'shieldX', tone: 'neutral' },
  sandbox: { pill: 'Sandbox', icon: 'box', tone: 'neutral' },
};

export const RUNTIME_DEFAULT = 'runtime-default';

export type AccessEngine = 'harness' | 'claude' | 'codex';

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

const RUNTIME_TITLE = 'As the runtime is set up';
const RUNTIME_DESCRIPTION = 'Uses the runtime’s own configuration on that computer';
const RUNTIME = option(RUNTIME_DEFAULT, RUNTIME_TITLE, RUNTIME_DESCRIPTION, 'runtime');
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

const CLAUDE_MODES: Readonly<Record<RuntimeDefault | ClaudeMode, AccessOption>> = {
  [RUNTIME_DEFAULT]: RUNTIME,
  default: option('default', 'Ask first', 'Before anything that changes', 'ask'),
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
  [RUNTIME_DEFAULT]: option(RUNTIME_DEFAULT, RUNTIME_TITLE, RUNTIME_DESCRIPTION, null),
  untrusted: ASK_FIRST,
  'on-request': ASK_NEEDED,
  never: option('never', 'No prompts', NEVER_ASK.description, null),
};

function listed(record: Readonly<Record<string, AccessOption>>): readonly AccessOption[] {
  return Object.values(record);
}

type SectionedEngine = Exclude<AccessEngine, 'harness'>;

const SECTIONS: Readonly<Record<SectionedEngine, readonly AccessSection[]>> = {
  claude: [{ id: 'mode', title: 'Mode', options: listed(CLAUDE_MODES) }],
  codex: [
    { id: 'access', title: 'Access', options: listed(CODEX_ACCESS) },
    { id: 'approvals', title: 'Approvals', options: listed(CODEX_APPROVALS) },
  ],
};

export function accessSections(engine: SectionedEngine): readonly AccessSection[] {
  return SECTIONS[engine];
}

export type AccessSelection =
  | {
      readonly kind: 'harness';
      readonly permission: AiHarnessPermission;
      readonly title: string | null;
    }
  | { readonly kind: 'claude'; readonly mode: ClaudeProviderOptions['permission_mode'] }
  | {
      readonly kind: 'codex';
      readonly sandbox: CodexProviderOptions['sandbox_policy'];
      readonly approval: CodexProviderOptions['approval_policy'];
    };

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

function pillOf(title: string, level: AccessLevel | null, asking: string | null): AccessPill {
  const known = level ?? 'runtime';
  const look = ACCESS_LEVELS[known];
  return { level: known, label: look.pill, title, icon: look.icon, tone: look.tone, asking };
}

const HARNESS_LEVELS: Readonly<Record<AiHarnessPermission['sandbox'], AccessLevel>> = {
  'read-only': 'read',
  'workspace-write': 'edits',
  'danger-full-access': 'full',
};

function pillFor(opt: AccessOption, asking: string | null): AccessPill {
  return pillOf(opt.title, opt.level, asking);
}

export function accessPill(selection: AccessSelection): AccessPill {
  switch (selection.kind) {
    case 'harness': {
      const level = HARNESS_LEVELS[selection.permission.sandbox];
      return pillOf(
        selection.title ?? ACCESS_LEVELS[level].pill,
        level,
        HARNESS_ASKING[selection.permission.approval],
      );
    }
    case 'claude':
      return pillFor(CLAUDE_MODES[selection.mode ?? RUNTIME_DEFAULT], null);
    case 'codex':
      return pillFor(
        CODEX_ACCESS[selection.sandbox?.type ?? RUNTIME_DEFAULT],
        codexAsking(selection.approval),
      );
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
