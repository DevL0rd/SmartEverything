import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { extraLicences, irLibraryLicences } from './licence-extras.ts';
import { installedPackages, noticeFile, noticesOf } from './licence-notices.ts';
import { productionPackages, readPolicy, REPOSITORY_ROOT } from './licence-policy.ts';
import type { ProductionPackage } from './licence-policy.ts';

const log = new Logger('tool.licenses-list');

const ASSETS = join(REPOSITORY_ROOT, 'apps', 'app', 'assets');
const OUTPUT = join(ASSETS, 'licences.json');
const NOTICES_OUTPUT = join(ASSETS, 'third-party-notices.txt');
const GO2RTC_DIRECTORY = join(REPOSITORY_ROOT, 'tooling', 'go2rtc');

const DRIVE_MOUNT_DIRECTORY = join(REPOSITORY_ROOT, 'tooling', 'drive-mount');

const GO2RTC_PIN = z.object({ version: z.string().min(1) });

function go2rtc(): { readonly entry: ProductionPackage; readonly text: string } {
  const pin = GO2RTC_PIN.parse(
    JSON.parse(readFileSync(join(GO2RTC_DIRECTORY, 'pin.json'), 'utf8')),
  );
  const text = readFileSync(join(GO2RTC_DIRECTORY, 'LICENSE'), 'utf8');
  if (!text.startsWith('MIT License')) {
    throw new Error('The go2rtc LICENSE is no longer MIT; update the licence list by hand.');
  }
  return { entry: { name: 'go2rtc', version: pin.version, licence: 'MIT' }, text: text.trim() };
}

const DRIVE_MOUNT_PIN = z.object({
  fuse: z.object({
    version: z.string().regex(/^v\d+\.\d+\.\d+$/u),
    licence: z.literal('BSD-3-Clause'),
  }),
});

function goFuse(): { readonly entry: ProductionPackage; readonly text: string } {
  const pin = DRIVE_MOUNT_PIN.parse(
    JSON.parse(readFileSync(join(DRIVE_MOUNT_DIRECTORY, 'pin.json'), 'utf8')),
  );
  const text = readFileSync(join(DRIVE_MOUNT_DIRECTORY, 'LICENSE'), 'utf8');
  if (
    !text.startsWith('New BSD License') ||
    !text.includes('Neither the name of Ivan Krasin nor the names of its')
  ) {
    throw new Error(
      'The go-fuse LICENSE is no longer BSD-3-Clause; update the licence list by hand.',
    );
  }
  return {
    entry: { name: 'go-fuse', version: pin.fuse.version.slice(1), licence: pin.fuse.licence },
    text: text.trim(),
  };
}

function byName(left: ProductionPackage, right: ProductionPackage): number {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

const policy = readPolicy();
const bundled = [go2rtc(), goFuse(), ...irLibraryLicences()];
const texts = new Map(bundled.map((one) => [one.entry.name, one.text]));
const all = [
  ...productionPackages(policy).filter((one) => !one.name.startsWith('@smarteverything/')),
  ...bundled.map((one) => one.entry),
  ...extraLicences(),
].sort(byName);
writeFileSync(OUTPUT, `${JSON.stringify(all, null, 2)}\n`);

const notices = noticesOf(all, installedPackages()).map((one) => ({
  ...one,
  text: texts.get(one.name) ?? one.text,
}));
writeFileSync(NOTICES_OUTPUT, noticeFile(notices));
log.info('licenses.listed', {
  count: all.length,
  output: OUTPUT,
  notices: NOTICES_OUTPUT,
  withoutText: notices.filter((one) => one.text === null).length,
});
