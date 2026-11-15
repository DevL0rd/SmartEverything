export function nameProblemOf(
  text: string,
  current: string | null,
  taken: ReadonlySet<string>,
): string | null {
  const name = text.trim();
  if (name === '' || name === current) return null;
  if (name.includes('/')) return 'A name can’t contain a slash.';
  if (name === '.' || name === '..') return 'That name isn’t allowed.';
  return taken.has(name) ? 'Something here already has that name.' : null;
}

export function nameReadyOf(
  text: string,
  current: string | null,
  taken: ReadonlySet<string>,
): boolean {
  const name = text.trim();
  return name !== '' && name !== current && nameProblemOf(text, current, taken) === null;
}

export function freeNameOf(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base} ${String(count)}`)) count += 1;
  return `${base} ${String(count)}`;
}
