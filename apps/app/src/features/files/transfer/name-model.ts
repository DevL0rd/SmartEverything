export function nameProblemOf(
  text: string,
  initial: string,
  taken: ReadonlySet<string>,
): string | null {
  const name = text.trim();
  if (name === '' || name === initial) return null;
  if (name.includes('/')) return 'A name can’t contain a slash.';
  if (name === '.' || name === '..') return 'That name isn’t allowed.';
  return taken.has(name) ? 'Something here already has that name.' : null;
}

export function nameReadyOf(text: string, initial: string, taken: ReadonlySet<string>): boolean {
  const name = text.trim();
  return name !== '' && name !== initial && nameProblemOf(text, initial, taken) === null;
}
