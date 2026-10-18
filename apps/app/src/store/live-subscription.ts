const REJECTED_INDEX = /tables\.(\d+):/g;

export function rejectedTables(sent: readonly string[], reason: string): string[] {
  const rejected = new Set<string>();
  for (const match of reason.matchAll(REJECTED_INDEX)) {
    const table = sent[Number(match[1])];
    if (table !== undefined) rejected.add(table);
  }
  return [...rejected];
}
