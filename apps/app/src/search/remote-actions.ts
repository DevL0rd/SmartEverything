export interface RemoteAction {
  readonly key: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly kinds: readonly string[];
  readonly settings?: true;
}

const REMOTE_ACTIONS: readonly RemoteAction[] = [
  {
    key: 'scene',
    title: 'Make a scene',
    keywords: ['scene', 'record', 'sequence', 'several keys', 'macro', 'routine', 'ir'],
    kinds: ['ir_blaster'],
  },
  {
    key: 'check',
    title: 'Check with a plug',
    keywords: [
      'check',
      'confirm',
      'verify',
      'plug',
      'power draw',
      'sensor',
      'assumed',
      'really on',
    ],
    kinds: ['ir_blaster', 'ir_remote'],
  },
  {
    key: 'wrong',
    title: 'It didn’t work?',
    keywords: ['mark as on', 'mark as off', 'press again', 'correct', 'wrong state', 'assumed'],
    kinds: ['ir_blaster', 'ir_remote'],
  },
  {
    key: 'learn',
    title: 'Learn a button',
    keywords: ['learn', 'teach', 'record a button', 'add a remote', 'infrared', 'ir', 'copy'],
    kinds: ['ir_blaster'],
    settings: true,
  },
];

export function remoteActionsOf(kind: string): readonly RemoteAction[] {
  return REMOTE_ACTIONS.filter((candidate) => candidate.kinds.includes(kind));
}
