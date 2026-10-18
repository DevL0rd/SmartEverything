import { createHash } from 'node:crypto';
import path from 'node:path';
import { Logger } from '@smarteverything/logging';
import { DEFINITION_MODE, PRIVATE_MODE } from './manager.js';
import type { ServiceFiles } from './system.js';

const log = new Logger('desktop.service');

export const ORIGINAL_SUFFIX = '.before-smarteverything';
const RECORD_FILE = 'service-unit.sha256';

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface UnitFiles {
  readonly files: ServiceFiles;
  readonly unitFile: string;
  readonly dataDirectory: string;
}

function recordFile(target: UnitFiles): string {
  return path.join(target.dataDirectory, RECORD_FILE);
}

export async function writeManagedUnit(target: UnitFiles, definition: string): Promise<void> {
  const { files, unitFile } = target;
  const existing = await files.read(unitFile);
  const recorded = await files.read(recordFile(target));
  const original = `${unitFile}${ORIGINAL_SUFFIX}`;
  const handWritten = existing !== null && existing !== definition && digest(existing) !== recorded;
  if (handWritten && (await files.read(original)) === null) {
    await files.write(original, existing, DEFINITION_MODE);
    log.info('service.unit_original_kept', { unit: path.basename(unitFile) });
  }
  await files.write(unitFile, definition, DEFINITION_MODE);
  await files.write(recordFile(target), digest(definition), PRIVATE_MODE);
}

export async function restoreOriginalUnit(target: UnitFiles): Promise<boolean> {
  const { files, unitFile } = target;
  const original = `${unitFile}${ORIGINAL_SUFFIX}`;
  const text = await files.read(original);
  if (text === null) return false;
  await files.write(unitFile, text, DEFINITION_MODE);
  await files.remove(original);
  await files.remove(recordFile(target));
  log.info('service.unit_original_restored', { unit: path.basename(unitFile) });
  return true;
}
