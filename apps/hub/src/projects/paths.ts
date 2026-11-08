import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AiChatRow } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';

const AREAS = ['workspace', 'temporary'] as const;

export function chatFolder(layout: HubLayout, chat: Pick<AiChatRow, 'id' | 'profile_id'>): string {
  return layout.chat(chat.profile_id, chat.id).project;
}

export function ensureChatFolder(root: string): string {
  for (const area of AREAS) mkdirSync(join(root, area), { recursive: true, mode: 0o700 });
  return root;
}
