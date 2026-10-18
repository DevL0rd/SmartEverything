import { z } from 'zod';
import listed from '../../../../assets/licences.json';

const LICENCES = z.array(
  z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
    licence: z.string().min(1),
  }),
);

export type Licence = z.infer<typeof LICENCES>[number];

let parsed: readonly Licence[] | null = null;

function licenceList(): readonly Licence[] {
  parsed ??= LICENCES.parse(listed);
  return parsed;
}

export function matchingLicences(query: string): readonly Licence[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return licenceList();
  }
  return licenceList().filter((entry) =>
    [entry.name, entry.licence].some((text) => text.toLowerCase().includes(needle)),
  );
}
