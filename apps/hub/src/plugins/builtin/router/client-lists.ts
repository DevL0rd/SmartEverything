function entriesOf(list: string): string[][] {
  return list
    .trim()
    .split('<')
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.split('>'));
}

function upsert(
  entries: string[][],
  matches: (fields: readonly string[]) => boolean,
  update: (fields: readonly string[]) => string[],
  created: string[],
): string[][] {
  const found = entries.some(matches);
  return found
    ? entries.map((fields) => (matches(fields) ? update(fields) : fields))
    : [...entries, created];
}

export function renameInClientList(list: string, mac: string, name: string): string {
  const upper = mac.toUpperCase();
  const entries = upsert(
    entriesOf(list),
    (fields) => fields[1]?.toUpperCase() === upper,
    ([, ...rest]) => [name, ...rest],
    [name, upper, '0', '0', '', '', '', '', ''],
  );
  return entries.map((fields) => fields.join('>')).join('<');
}

export function reserveInStaticList(list: string, mac: string, ip: string): string {
  const upper = mac.toUpperCase();
  const entries = upsert(
    entriesOf(list),
    (fields) => fields[0]?.toUpperCase() === upper,
    ([first = upper, , ...rest]) => [first, ip, ...rest],
    [upper, ip, '', ''],
  );
  return entries.map((fields) => `<${fields.join('>')}`).join('');
}
