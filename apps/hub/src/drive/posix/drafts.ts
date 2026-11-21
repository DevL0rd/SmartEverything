import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { utf8Bytes } from '@smarteverything/domain/drive-mount';
import type { DriveItemDraft } from '../../store/repositories/drive-items';
import type { NewItem } from '../change-rows';

export const NO_IDENTITY = { dev: '0', ino: '0' } as const;

function commonOf(item: NewItem): {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly starred: false;
  readonly shared: false;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly remoteId: null;
  readonly remoteRev: null;
} {
  return {
    id: item.id ?? randomUUID(),
    rootId: item.rootId,
    parentId: item.parentId,
    relPath: item.relPath,
    name: basename(item.relPath),
    modifiedAt: item.modifiedAt,
    addedAt: item.addedAt,
    starred: false,
    shared: false,
    outside: item.outside,
    addedByProfileId: item.addedByProfileId,
    remoteId: null,
    remoteRev: null,
  };
}

export function linkDraft(item: NewItem, target: string): DriveItemDraft {
  return { ...commonOf(item), kind: 'link', bytes: utf8Bytes(target), linkTarget: target };
}

export function specialDraft(item: NewItem): DriveItemDraft {
  return { ...commonOf(item), kind: 'special', bytes: 0 };
}
