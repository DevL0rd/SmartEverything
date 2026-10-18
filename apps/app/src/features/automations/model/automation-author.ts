import type { AutomationRow, ProfileRow } from '@smarteverything/domain';

export function authorLine(
  row: Pick<AutomationRow, 'author' | 'origin'>,
  people: readonly Pick<ProfileRow, 'id' | 'name'>[],
): string {
  if (row.origin !== null) return `Made through the ${row.origin.plugin_id} plugin.`;
  if (row.author === null) return 'Made before the maker was recorded.';
  const name = people.find((person) => person.id === row.author?.profile_id)?.name;
  const who = name ?? 'someone who was removed';
  return row.author.via === 'assistant' ? `Made by the AI for ${who}.` : `Made by ${who}.`;
}
