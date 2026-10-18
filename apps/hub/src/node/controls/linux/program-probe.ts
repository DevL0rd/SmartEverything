import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';

const SEARCH_PATH = z.object({ PATH: z.string().optional() });

export type ProgramProbe = (program: string) => Promise<boolean>;

export const programAvailable: ProgramProbe = async (program) => {
  const directories = (SEARCH_PATH.parse(env).PATH ?? '')
    .split(delimiter)
    .filter((directory) => directory !== '');
  for (const directory of directories) {
    const found = await access(join(directory, program), constants.X_OK).then(
      () => true,
      () => false,
    );
    if (found) {
      return true;
    }
  }
  return false;
};

export function cachedProbe(probe: ProgramProbe): ProgramProbe {
  const answers = new Map<string, Promise<boolean>>();
  return (program) => {
    const known = answers.get(program);
    if (known !== undefined) {
      return known;
    }
    const asked = probe(program);
    answers.set(program, asked);
    return asked;
  };
}
