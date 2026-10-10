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

const LICENCE_LIST: readonly Licence[] = LICENCES.parse(listed);

export function matchingLicences(query: string): readonly Licence[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return LICENCE_LIST;
  }
  return LICENCE_LIST.filter((entry) =>
    [entry.name, entry.licence].some((text) => text.toLowerCase().includes(needle)),
  );
}
