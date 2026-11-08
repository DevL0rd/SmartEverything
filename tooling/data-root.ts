import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  bootstrapDirectory,
  LOCATION_FILE,
  resolveHubRoot,
  type PointerEnvironment,
} from '../apps/hub/src/data-layout/index.ts';

export class DataFolderRequiredError extends Error {
  override readonly name = 'DataFolderRequiredError';

  constructor(pointer: string) {
    super(`pass --data <hub data folder>: no data folder pointer exists at ${pointer}`);
  }
}

export async function dataRootOf(
  flag: string | undefined,
  environment: PointerEnvironment,
): Promise<string> {
  if (flag !== undefined) return resolve(flag);
  const pointer = join(bootstrapDirectory(environment), LOCATION_FILE);
  if (!existsSync(pointer)) throw new DataFolderRequiredError(pointer);
  return (await resolveHubRoot(environment)).root;
}
