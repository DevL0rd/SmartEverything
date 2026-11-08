import { ApiError } from '@smarteverything/domain';

const NAME_LIMIT = 80;

interface Named {
  readonly findByName: (name: string) => { readonly id: string } | undefined;
}

export function freeName(rows: Named, wanted: string): string {
  if (rows.findByName(wanted) === undefined) return wanted;
  for (let number = 2; ; number += 1) {
    const suffix = ` ${String(number)}`;
    const candidate = `${wanted.slice(0, NAME_LIMIT - suffix.length).trimEnd()}${suffix}`;
    if (rows.findByName(candidate) === undefined) return candidate;
  }
}

export function requireFreeName(rows: Named, name: string, ownId: string): void {
  const taken = rows.findByName(name);
  if (taken !== undefined && taken.id !== ownId) {
    throw new ApiError(
      'conflict',
      `An automation named "${name}" already exists. Choose another name.`,
    );
  }
}
