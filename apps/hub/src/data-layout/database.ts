import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from './layout';

export const DATABASE_FOLDER = z
  .string({ error: 'name the absolute folder that holds the Hub database' })
  .refine(isAbsolute, { message: 'must be an absolute path' });

const CONFIGURED = z.looseObject({ database: DATABASE_FOLDER });

class DatabaseFolderError extends Error {
  override readonly name = 'DatabaseFolderError';
}

export function withDatabase(layout: HubLayout, folder: string): HubLayout {
  const { file, wal, shm } = layout.system.database;
  return {
    ...layout,
    system: {
      ...layout.system,
      database: {
        file: join(folder, basename(file)),
        wal: join(folder, basename(wal)),
        shm: join(folder, basename(shm)),
      },
    },
  };
}

function configuredText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (cause) {
    throw new DatabaseFolderError(`The service configuration ${file} could not be read.`, {
      cause,
    });
  }
}

function configuredFolder(file: string): string {
  let json: unknown;
  try {
    json = JSON.parse(configuredText(file));
  } catch (cause) {
    if (cause instanceof DatabaseFolderError) throw cause;
    throw new DatabaseFolderError(`The service configuration ${file} is not JSON.`, { cause });
  }
  const parsed = CONFIGURED.safeParse(json);
  if (!parsed.success)
    throw new DatabaseFolderError(
      `The service configuration ${file} must set "database" to the absolute folder that holds the Hub database: ${z.prettifyError(parsed.error)}`,
    );
  return parsed.data.database;
}

function existingFolder(folder: string, file: string): string {
  const found = statSync(folder, { throwIfNoEntry: false });
  if (found?.isDirectory() !== true)
    throw new DatabaseFolderError(
      `The Hub database folder ${folder} named in ${file} does not exist or is not a folder.`,
    );
  return folder;
}

export function configuredLayout(layout: HubLayout): HubLayout {
  const file = layout.system.config.service;
  return withDatabase(layout, existingFolder(configuredFolder(file), file));
}
