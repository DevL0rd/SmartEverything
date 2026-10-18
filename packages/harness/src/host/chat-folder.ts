import { isAbsolute, relative, resolve } from 'node:path';

export const CHAT_FOLDER_TOOLS: ReadonlySet<string> = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'read_image',
]);
const PATTERN_ARGUMENT: Readonly<Record<string, string>> = { glob: 'pattern', grep: 'include' };
const REFUSAL = 'Files outside this chat’s folder are for the owner of the Hub.';

export function chatFolderRefusal(
  tool: string,
  args: Readonly<Record<string, unknown>>,
  folder: string,
): string | undefined {
  for (const key of ['file_path', 'path']) {
    const value = args[key];
    if (typeof value === 'string' && !inside(folder, value)) return REFUSAL;
  }
  const pattern = args[PATTERN_ARGUMENT[tool] ?? ''];
  if (
    typeof pattern === 'string' &&
    (isAbsolute(pattern) || pattern.split(/[\\/]/u).includes('..'))
  )
    return REFUSAL;
  return undefined;
}

function inside(folder: string, path: string): boolean {
  const from = relative(folder, resolve(folder, path));
  return from === '' || (from !== '..' && !from.startsWith('../') && !isAbsolute(from));
}
