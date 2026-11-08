import { randomInt } from 'node:crypto';
import { AI_CHAT_ROW } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { z } from 'zod';
import type { StoreContext } from '../context';

const HELPER_NAMES = [
  'Aster',
  'Clover',
  'Echo',
  'Ember',
  'Fern',
  'Iris',
  'Juno',
  'Lumen',
  'Mica',
  'Nova',
  'Onyx',
  'Orion',
  'Quill',
  'Reed',
  'Sage',
  'Wren',
] as const;

export const STORED_CHAT = storedRow(
  AI_CHAT_ROW.refine((chat) => (chat.kind === 'subagent') === (chat.helper_name !== null), {
    path: ['helper_name'],
    message: 'A stored helper must have its assigned display name.',
  }),
  {
    json: ['engine', 'tools', 'origin', 'pending_execution_target'],
    flags: ['pinned', 'memory', 'cost_incomplete'],
  },
);

const SIBLING_NAME = z.strictObject({ helper_name: z.string() });

function pickName(names: readonly string[]): string {
  const name = names.at(randomInt(names.length));
  if (name === undefined) throw new RangeError('No helper name at the selected index.');
  return name;
}

export function nextHelperName(context: StoreContext, parentId: string | null): string {
  const siblings = context.sql.all(
    SIBLING_NAME,
    'select helper_name from ai_chats where parent_id = $parent and helper_name is not null',
    { parent: parentId },
  );
  const occupied = new Set(siblings.map((row) => row.helper_name.toLowerCase()));
  const available = HELPER_NAMES.filter((name) => !occupied.has(name.toLowerCase()));
  if (available.length > 0) return pickName(available);

  const base = pickName(HELPER_NAMES);
  let suffix = 2;
  while (occupied.has(`${base.toLowerCase()} ${String(suffix)}`)) suffix += 1;
  return `${base} ${String(suffix)}`;
}
