import {
  HUB_UPDATE_COMMIT,
  RELEASE_NOTES,
  RELEASE_NOTES_MAX_LENGTH,
} from '@smarteverything/domain';
import { z } from 'zod';
import { gitSource } from './hub-update-source.ts';

const HUB_NOTES_PATH = 'release-notes/hub.json';
const MAX_JSON_ESCAPE_BYTES = 6;
const MAX_JSON_FRAMING_BYTES = 1024;
const MAX_HUB_NOTES_BYTES =
  MAX_JSON_ESCAPE_BYTES * RELEASE_NOTES_MAX_LENGTH + MAX_JSON_FRAMING_BYTES;
const REGULAR_FILE = /^100(?:644|755) blob ([a-f0-9]+) +(\d+|BAD)\t/u;
const PARENT_COMMITS = HUB_UPDATE_COMMIT.array().nonempty();
const HUB_NOTES = z.strictObject({ from: HUB_UPDATE_COMMIT, notes: RELEASE_NOTES });

function notesFrom(text: string, from: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = HUB_NOTES.safeParse(value);
  return parsed.success && parsed.data.from === from ? parsed.data.notes : undefined;
}

interface NotesBlob {
  readonly identity: string;
  readonly size: number | undefined;
}

type NotesTree =
  | { readonly status: 'unavailable' }
  | { readonly status: 'available'; readonly blob: NotesBlob | undefined };

function notesBlob(text: string): NotesBlob | undefined {
  const match = REGULAR_FILE.exec(text);
  const identity = HUB_UPDATE_COMMIT.safeParse(match?.[1]);
  const size = match?.[2];
  if (!identity.success || size === undefined) return undefined;
  return { identity: identity.data, size: size === 'BAD' ? undefined : Number(size) };
}

async function notesTree(folder: string, commit: string): Promise<NotesTree> {
  const { code, text } = await gitSource(folder, [
    '--no-replace-objects',
    'ls-tree',
    '-l',
    '-z',
    commit,
    '--',
    HUB_NOTES_PATH,
  ]);
  return code === 0 ? { status: 'available', blob: notesBlob(text) } : { status: 'unavailable' };
}

async function authoredAt(folder: string, tip: string, identity: string): Promise<boolean> {
  const { code, text } = await gitSource(folder, [
    '--no-replace-objects',
    'rev-list',
    '--parents',
    '--max-count=1',
    tip,
  ]);
  const [commit, ...parents] = text.trim().split(' ');
  const parsed = PARENT_COMMITS.safeParse(parents);
  if (code !== 0 || commit !== tip || !parsed.success) return false;
  for (const parent of parsed.data) {
    const tree = await notesTree(folder, parent);
    if (tree.status === 'unavailable' || tree.blob?.identity === identity) return false;
  }
  return true;
}

export async function readHubSourceNotes(
  folder: string,
  from: string,
  tip: string,
): Promise<string | undefined> {
  const tree = await notesTree(folder, tip);
  if (tree.status === 'unavailable') return undefined;
  const { blob } = tree;
  if (blob?.size === undefined || blob.size > MAX_HUB_NOTES_BYTES) return undefined;
  if (!(await authoredAt(folder, tip, blob.identity))) return undefined;
  const { code, text } = await gitSource(folder, [
    '--no-replace-objects',
    'cat-file',
    'blob',
    blob.identity,
  ]);
  return code === 0 ? notesFrom(text, from) : undefined;
}
