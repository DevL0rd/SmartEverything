import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const AREAS = ['workspace', 'temporary'] as const;

export function chatFolder(dataDirectory: string, chat: string): string {
  return join(dataDirectory, 'assistant', 'projects', z.uuid().parse(chat));
}

export function ensureChatFolder(root: string): string {
  for (const area of AREAS) mkdirSync(join(root, area), { recursive: true, mode: 0o700 });
  return root;
}
