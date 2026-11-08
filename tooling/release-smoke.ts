import { parseArgs } from 'node:util';
import { env } from 'node:process';
import { z } from 'zod';
import { apkProblems, readApk, readAppIdentity, type ApkVariant } from './release-apk.ts';
import { dataRootOf } from './data-root.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { parseSchemaFlag, systemdUnits, verifyHub } from './release-hub-verify.ts';
import { readReleaseVersion } from './release-version.ts';

export type SmokeArea = 'phone' | 'desktop' | 'hub';
export type SmokeCoverage = 'apk' | 'hub' | 'manual';

export interface SmokeStep {
  readonly id: string;
  readonly area: SmokeArea;
  readonly check: string;
  readonly coverage: SmokeCoverage;
}

export const SMOKE_STEPS: readonly SmokeStep[] = [
  {
    id: 'apk-identity',
    area: 'phone',
    coverage: 'apk',
    check:
      'The APK has the one app id, the release number and a version code above the code given with --above (the newest published or installed one).',
  },
  {
    id: 'apk-signed',
    area: 'phone',
    coverage: 'apk',
    check:
      'The APK is signed with the app certificate in app-identity.json, so it installs over the app, and the signature verifies.',
  },
  {
    id: 'apk-not-debuggable',
    area: 'phone',
    coverage: 'apk',
    check: 'The APK is not debuggable and has no Expo dev launcher classes.',
  },
  {
    id: 'apk-permissions',
    area: 'phone',
    coverage: 'apk',
    check:
      'All Health Connect permissions are declared and every permission is explained on the privacy page.',
  },
  {
    id: 'phone-install',
    area: 'phone',
    coverage: 'manual',
    check:
      'Installs next to the dev app, opens straight into the app with no dev menu, no red box and no Metro connection attempt.',
  },
  {
    id: 'phone-pair',
    area: 'phone',
    coverage: 'manual',
    check:
      'Pairs with the hub by QR (camera permission prompt), reconnects on the home network and from outside, and the hub socket stays up after background and foreground.',
  },
  {
    id: 'phone-pages',
    area: 'phone',
    coverage: 'manual',
    check:
      'Home, Devices, Cameras, Fitness, Talk, Assistant and Settings each open and switch quickly.',
  },
  {
    id: 'phone-health',
    area: 'phone',
    coverage: 'manual',
    check:
      'The Health Connect permission screen opens, the rationale and privacy link work, and a sync uploads records.',
  },
  {
    id: 'phone-microphone',
    area: 'phone',
    coverage: 'manual',
    check:
      'Wake listening starts and stops with its notification, the walkie-talkie works while held, and an assistant call with Gemini Live connects.',
  },
  {
    id: 'phone-screen',
    area: 'phone',
    coverage: 'manual',
    check:
      'The screen capture consent dialog appears for the assistant and the call notification shows the right service types.',
  },
  {
    id: 'phone-cameras',
    area: 'phone',
    coverage: 'manual',
    check: 'A camera live view (WebRTC) and a clip play with no cleartext errors in logcat.',
  },
  {
    id: 'phone-push',
    area: 'phone',
    coverage: 'manual',
    check: 'Notifications arrive through Firebase for the release package.',
  },
  {
    id: 'phone-reboot',
    area: 'phone',
    coverage: 'manual',
    check: 'The watch and scale relays survive a reboot.',
  },
  {
    id: 'phone-licences',
    area: 'phone',
    coverage: 'manual',
    check: 'Settings, About, Licences renders the list.',
  },
  {
    id: 'phone-developer',
    area: 'phone',
    coverage: 'manual',
    check: 'The Verbose logging toggle is visible and works, and the profiling toggles are hidden.',
  },
  {
    id: 'phone-logcat',
    area: 'phone',
    coverage: 'manual',
    check: 'logcat at rest shows no debug lines from the app.',
  },
  {
    id: 'desktop-install',
    area: 'desktop',
    coverage: 'manual',
    check:
      'The desktop installer opens the app and tray without creating or replacing a hub service.',
  },
  {
    id: 'desktop-link',
    area: 'desktop',
    coverage: 'manual',
    check: 'The smarteverything:// link opens the app and the overlay appears on the first call.',
  },
  {
    id: 'hub-up',
    area: 'hub',
    coverage: 'hub',
    check:
      'Both units are active, the privacy page answers 200, the schema is the expected one, the owner API lists devices and the log has no startup failure.',
  },
  {
    id: 'hub-wake',
    area: 'hub',
    coverage: 'manual',
    check: 'Wake spotter lines appear in the log after saying the wake word at a computer.',
  },
  {
    id: 'hub-rollback',
    area: 'hub',
    coverage: 'manual',
    check:
      'release-hub.ts rollback --dry-run --backup <newest verified backup> passes: the backup holds the service files and a readable database and the disks have room to restore it.',
  },
];

const VARIANT = z.enum(['release', 'development']);
const COUNT_FLAG = z.string().regex(/^\d+$/u, 'must be a whole number').transform(Number);
const SERVER_FLAG = z.url({ protocol: /^https?$/u });

export function stepsCovered(coverage: SmokeCoverage): readonly SmokeStep[] {
  return SMOKE_STEPS.filter((step) => step.coverage === coverage);
}

function printList(): void {
  for (const step of SMOKE_STEPS) {
    const mark = step.coverage === 'manual' ? 'you ' : 'auto';
    process.stdout.write(`${mark} ${step.area.padEnd(7)} ${step.id.padEnd(18)} ${step.check}\n`);
  }
}

function printManual(area: SmokeArea): void {
  const pending = stepsCovered('manual').filter((step) => step.area === area);
  process.stdout.write(`\nNeeds you (${area}):\n`);
  for (const step of pending) process.stdout.write(`  [ ] ${step.id}: ${step.check}\n`);
}

export interface ApkRequest {
  readonly file: string;
  readonly variant: ApkVariant;
  readonly above: number;
  readonly server: string | undefined;
}

async function checkApk({ file, variant, above, server }: ApkRequest): Promise<void> {
  const identity = readAppIdentity();
  const problems = await apkProblems(readApk(file), {
    variant,
    applicationId: identity.applicationId,
    signingCertificateSha256: identity.signingCertificateSha256,
    versionName: readReleaseVersion('app'),
    versionCodeAbove: above,
    ...(server === undefined ? {} : { server }),
  });
  for (const step of stepsCovered('apk')) {
    const failed = problems.filter((problem) => problem.step === step.id);
    process.stdout.write(`${failed.length === 0 ? 'ok  ' : 'FAIL'} ${step.id}\n`);
    for (const problem of failed) process.stdout.write(`       ${problem.message}\n`);
  }
  if (problems.length > 0) process.exitCode = 1;
  printManual('phone');
}

async function checkHub(
  url: string,
  schema: number | null,
  data: string | undefined,
): Promise<void> {
  const checks = await verifyHub(
    dataLayoutOf(await dataRootOf(data, env)),
    url,
    systemdUnits,
    schema,
  );
  for (const check of checks)
    process.stdout.write(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}\n`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
  printManual('hub');
}

const FLAGS = {
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    variant: { type: 'string' },
    above: { type: 'string' },
    server: { type: 'string' },
    url: { type: 'string' },
    schema: { type: 'string' },
    data: { type: 'string' },
  },
} as const;

const USAGE =
  'usage: tsx tooling/release-smoke.ts list | apk --file <apk> --above <versionCode of the newest published or installed build> [--variant release|development] [--server <https url>] | hub --url <https url> [--schema <n>] [--data <hub data folder>]';

export function parseApkRequest(values: Readonly<Record<string, string | undefined>>): ApkRequest {
  const { file, above } = values;
  if (file === undefined || above === undefined) throw new Error(USAGE);
  return {
    file,
    variant: VARIANT.parse(values['variant'] ?? 'release'),
    above: COUNT_FLAG.parse(above),
    server: values['server'] === undefined ? undefined : SERVER_FLAG.parse(values['server']),
  };
}

export function parseHubRequest(values: Readonly<Record<string, string | undefined>>): {
  readonly url: string;
  readonly schema: number | null;
} {
  const { url, schema } = values;
  if (url === undefined) throw new Error(USAGE);
  return { url: SERVER_FLAG.parse(url), schema: parseSchemaFlag(schema) };
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs(FLAGS);
  const command = positionals[0];
  if (command === 'list') {
    printList();
    return;
  }
  if (command === 'apk') return checkApk(parseApkRequest(values));
  if (command === 'hub') {
    const request = parseHubRequest(values);
    return checkHub(request.url, request.schema, values.data);
  }
  throw new Error(USAGE);
}

if (import.meta.main) await main();
