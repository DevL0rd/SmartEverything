import type { AiReference, AiReferenceKind } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
export const REFERENCE_SECTIONS: Readonly<Record<AiReferenceKind, string>> = {
  managed_path: 'Files',
  device_path: 'Files',
  skill: 'Skills',
  plugin: 'Plugins',
  chat: 'Chats',
  command: 'Commands',
  agent: 'Agents',
};
export function referenceKey(reference: AiReference): string {
  return JSON.stringify(reference);
}
export function referenceIcon(reference: AiReference): IconName {
  switch (reference.kind) {
    case 'managed_path':
    case 'device_path':
      return reference.entry_kind === 'directory' ? 'folder' : 'fileText';
    case 'skill':
      return 'sparkles';
    case 'plugin':
      return 'puzzle';
    case 'chat':
      return 'messageCircle';
    case 'command':
      return 'terminal';
    case 'agent':
      return 'users';
  }
}

export const REFERENCE_ORDER: Readonly<Record<AiReferenceKind, number>> = {
  managed_path: 0,
  device_path: 0,
  skill: 1,
  plugin: 2,
  chat: 3,
  command: 4,
  agent: 5,
};

export function referenceLocation(reference: AiReference): string {
  switch (reference.kind) {
    case 'managed_path':
      return `Chat workspace · ${reference.path}`;
    case 'device_path':
      return `${reference.workspace_root}/${reference.path}`;
    case 'skill':
      return `${reference.provider} · ${reference.source}`;
    case 'plugin':
      return reference.asset_id;
    case 'chat':
      return `Chat ${reference.chat_id}`;
    case 'command':
      return reference.definition_id;
    case 'agent':
      return reference.identity;
  }
}
