const CHANGING = new Set([
  'add',
  'remove',
  'rm',
  'uninstall',
  'un',
  'up',
  'update',
  'upgrade',
  'install',
  'i',
  'dedupe',
  'pkg',
  'patch-commit',
  'patch-remove',
  'import',
  'link',
  'ln',
  'unlink',
  'prune',
  'approve-builds',
]);
const CONFIG_WRITES = new Set(['set', 'delete']);
const READ_ONLY = new Set([
  'run',
  'exec',
  'test',
  't',
  'ls',
  'list',
  'll',
  'why',
  'outdated',
  'view',
  'info',
  'show',
  'store',
  'help',
  'bin',
  'root',
  'dlx',
  'create',
  'licenses',
  'config',
  'audit',
  'patch',
]);

function changesInSegment(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  const start = words.indexOf('pnpm');
  if (start === -1) return false;
  const rest = words.slice(start + 1).filter((word) => !word.startsWith('-'));
  const command = rest.find((word) => CHANGING.has(word) || READ_ONLY.has(word));
  if (command === 'audit') return words.includes('--fix');
  if (command === 'config') return CONFIG_WRITES.has(rest[rest.indexOf('config') + 1] ?? '');
  return command !== undefined && CHANGING.has(command);
}

export function changesDependencies(command: string): boolean {
  return command.split(/&&|\|\||[;|\n]/).some(changesInSegment);
}
