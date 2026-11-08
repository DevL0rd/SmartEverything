import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { androidHome } from './release-process.ts';

const ROOT = join(import.meta.dirname, '..');

const BUILD_TOOLS_TIMEOUT_MS = 120_000;
const DEV_LAUNCHER_CLASS = 'Lexpo/modules/devlauncher/';
const OWN_PERMISSION_SUFFIX = '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION';
const UPDATE_URL_KEY = 'expo.modules.updates.EXPO_UPDATE_URL';
const RUNTIME_VERSION_KEY = 'expo.modules.updates.EXPO_RUNTIME_VERSION';
const FINGERPRINT_PLACEHOLDER = 'file:fingerprint';
const FINGERPRINT_ASSET = 'assets/fingerprint';
const CODE_SIGNING_CERTIFICATE_KEY = 'expo.modules.updates.CODE_SIGNING_CERTIFICATE';
export const UPDATE_MANIFEST_PATH = '/api/app-update/manifest';

const HEALTH_PLUGIN = join(
  ROOT,
  'apps',
  'app',
  'modules',
  'health-connect',
  'plugin',
  'with-health-connect.ts',
);
const APP_IDENTITY_FILE = join(ROOT, 'apps', 'app', 'app-identity.json');
const PRIVACY_SECTIONS = join(ROOT, 'apps', 'hub', 'src', 'extensions', 'privacy', 'sections.ts');

const APP_IDENTITY = z.object({
  applicationId: z.string().min(1),
  signingCertificateSha256: z.string().regex(/^[0-9a-f]{64}$/u),
});
const HEALTH_PERMISSIONS = z.object({ HEALTH_CONNECT_PERMISSIONS: z.array(z.string().min(1)) });
const PRIVACY_TOPICS = z.object({
  PRIVACY_PERMISSION_TOPICS: z.record(z.string(), z.string()),
  LAUNCHER_BADGE_PERMISSION: z.instanceof(RegExp),
  HEALTH_CONNECT_PERMISSION_PREFIX: z.string(),
});

const BADGING_HEADER =
  /^package: name='(?<packageName>[^']+)' versionCode='(?<versionCode>\d+)' versionName='(?<versionName>[^']*)'/mu;
const BADGING_FIELDS = z.object({
  packageName: z.string().min(1),
  versionCode: z.string().min(1),
  versionName: z.string(),
});

export type ApkVariant = 'release' | 'development';

export type AppIdentity = z.infer<typeof APP_IDENTITY>;

export function readAppIdentity(): AppIdentity {
  return APP_IDENTITY.parse(JSON.parse(readFileSync(APP_IDENTITY_FILE, 'utf8')));
}

export interface ApkFacts {
  readonly file: string;
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
  readonly debuggable: boolean;
  readonly permissions: readonly string[];
  readonly signerSha256: string | null;
  readonly signatureVerifies: boolean;
  readonly includesDevLauncher: boolean;
  readonly metaData: Readonly<Record<string, string>>;
  readonly fingerprint: string | null;
}

export interface ApkExpectation {
  readonly variant: ApkVariant;
  readonly applicationId: string;
  readonly signingCertificateSha256: string;
  readonly versionName: string;
  readonly versionCodeAbove: number;
  readonly server?: string;
}

export class BuildToolsMissingError extends Error {
  override readonly name = 'BuildToolsMissingError';

  constructor(readonly searched: string) {
    super(
      `aapt2 and apksigner were not found under ${searched}; install Android build-tools or set ANDROID_HOME.`,
    );
  }
}

export class ApkReadError extends Error {
  override readonly name = 'ApkReadError';

  constructor(
    readonly tool: string,
    readonly output: string,
  ) {
    super(`${tool} failed: ${output.slice(0, 500)}`);
  }
}

export function buildTool(name: 'aapt2' | 'apksigner'): string {
  const root = join(androidHome(), 'build-tools');
  const versions = existsSync(root)
    ? readdirSync(root).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    : [];
  const found = versions
    .map((version) => join(root, version, name))
    .find((path) => existsSync(path));
  if (found === undefined) throw new BuildToolsMissingError(root);
  return found;
}

function run(
  tool: string,
  args: readonly string[],
): { readonly text: string; readonly status: number } {
  const result = spawnSync(tool, [...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: BUILD_TOOLS_TIMEOUT_MS,
  });
  if (result.error !== undefined) throw new ApkReadError(tool, result.error.message);
  return { text: result.stdout, status: result.status ?? 1 };
}

export function parseBadging(
  text: string,
): Pick<ApkFacts, 'packageName' | 'versionCode' | 'versionName' | 'debuggable' | 'permissions'> {
  const header = BADGING_HEADER.exec(text)?.groups;
  if (header === undefined)
    throw new ApkReadError('aapt2', 'the badging output has no package line');
  const { packageName, versionCode, versionName } = BADGING_FIELDS.parse(header);
  return {
    packageName,
    versionCode: Number(versionCode),
    versionName,
    debuggable: /^application-debuggable$/mu.test(text),
    permissions: [...text.matchAll(/^uses-permission: name='([^']+)'/gmu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  };
}

export function parseSigner(text: string): string | null {
  return /^Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})$/mu.exec(text)?.[1] ?? null;
}

export function parseMetaData(text: string): Readonly<Record<string, string>> {
  const entries = text
    .split(/^\s*E: /mu)
    .filter((element) => element.startsWith('meta-data'))
    .flatMap((element) => {
      const name = /:name\(0x[0-9a-f]+\)="([^"]*)"/u.exec(element)?.[1];
      const value =
        /:value\(0x[0-9a-f]+\)="([^"]*)"/u.exec(element)?.[1] ??
        /:value\(0x[0-9a-f]+\)=(@0x[0-9a-f]+)/u.exec(element)?.[1] ??
        /:value\(0x[0-9a-f]+\)=\(type 0x[0-9a-f]+\)(0x[0-9a-f]+)/u.exec(element)?.[1] ??
        /:value\(0x[0-9a-f]+\)=([^\s"(]+)/u.exec(element)?.[1] ??
        /:resource\(0x[0-9a-f]+\)=(@0x[0-9a-f]+)/u.exec(element)?.[1];
      if (name === undefined) return [];
      if (value === undefined) throw new ApkReadError('aapt2', `meta-data ${name} has no value`);
      return [[name, value] as const];
    });
  return Object.fromEntries(entries);
}

function dexFiles(apk: string): readonly string[] {
  return run('unzip', ['-Z1', apk])
    .text.split('\n')
    .filter((name) => /^classes\d*\.dex$/u.test(name));
}

function containsDevLauncher(apk: string): boolean {
  const needle = Buffer.from(DEV_LAUNCHER_CLASS);
  return dexFiles(apk).some((dex) => {
    const result = spawnSync('unzip', ['-p', apk, dex], { maxBuffer: 512 * 1024 * 1024 });
    return result.stdout.includes(needle);
  });
}

export function parseFingerprint(text: string): string | null {
  const fingerprint = text.trim();
  return fingerprint === '' ? null : fingerprint;
}

function readFingerprint(apk: string): string | null {
  const result = run('unzip', ['-p', apk, FINGERPRINT_ASSET]);
  return result.status === 0 ? parseFingerprint(result.text) : null;
}

export function readApk(file: string): ApkFacts {
  const badging = run(buildTool('aapt2'), ['dump', 'badging', file]);
  if (badging.status !== 0) throw new ApkReadError('aapt2', badging.text);
  const manifest = run(buildTool('aapt2'), [
    'dump',
    'xmltree',
    '--file',
    'AndroidManifest.xml',
    file,
  ]);
  if (manifest.status !== 0) throw new ApkReadError('aapt2', manifest.text);
  const signature = run(buildTool('apksigner'), ['verify', '--print-certs', file]);
  return {
    file,
    ...parseBadging(badging.text),
    signerSha256: parseSigner(signature.text),
    signatureVerifies: signature.status === 0,
    includesDevLauncher: containsDevLauncher(file),
    metaData: parseMetaData(manifest.text),
    fingerprint: readFingerprint(file),
  };
}

async function loadFrom<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await import(pathToFileURL(path).href));
}

export async function expectedHealthPermissions(): Promise<readonly string[]> {
  return (await loadFrom(HEALTH_PLUGIN, HEALTH_PERMISSIONS)).HEALTH_CONNECT_PERMISSIONS;
}

export async function unexplainedPermissions(facts: ApkFacts): Promise<readonly string[]> {
  const topics = await loadFrom(PRIVACY_SECTIONS, PRIVACY_TOPICS);
  return facts.permissions.filter(
    (name) =>
      !name.startsWith(topics.HEALTH_CONNECT_PERMISSION_PREFIX) &&
      !name.endsWith(OWN_PERMISSION_SUFFIX) &&
      !topics.LAUNCHER_BADGE_PERMISSION.test(name) &&
      topics.PRIVACY_PERMISSION_TOPICS[name] === undefined,
  );
}

export interface ApkProblem {
  readonly step: 'apk-identity' | 'apk-signed' | 'apk-not-debuggable' | 'apk-permissions';
  readonly message: string;
}

function problem(step: ApkProblem['step'], message: string): ApkProblem {
  return { step, message };
}

export function identityProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  return [
    ...(facts.packageName === expected.applicationId
      ? []
      : [
          problem(
            'apk-identity',
            `package is ${facts.packageName}, expected ${expected.applicationId}`,
          ),
        ]),
    ...(facts.versionName === expected.versionName
      ? []
      : [
          problem(
            'apk-identity',
            `versionName is ${facts.versionName}, expected ${expected.versionName}`,
          ),
        ]),
    ...(facts.versionCode > expected.versionCodeAbove
      ? []
      : [
          problem(
            'apk-identity',
            `versionCode ${String(facts.versionCode)} is not above ${String(expected.versionCodeAbove)}`,
          ),
        ]),
  ];
}

export function signingProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  if (!facts.signatureVerifies || facts.signerSha256 === null) {
    return [problem('apk-signed', 'the APK is unsigned or its signature does not verify')];
  }
  return facts.signerSha256 === expected.signingCertificateSha256
    ? []
    : [
        problem(
          'apk-signed',
          `the APK is signed with certificate ${facts.signerSha256}, not the app's ${expected.signingCertificateSha256}, so it cannot install over the app`,
        ),
      ];
}

export function releaseProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  if (expected.variant !== 'release') return [];
  return [
    ...(facts.debuggable ? [problem('apk-not-debuggable', 'the release APK is debuggable')] : []),
    ...(facts.includesDevLauncher
      ? [problem('apk-not-debuggable', 'the release APK contains the Expo dev launcher')]
      : []),
  ];
}

function runtimeIsFingerprint(declared: string): boolean {
  return declared === '' || declared.startsWith('@') || declared === FINGERPRINT_PLACEHOLDER;
}

export function runtimeVersionOf(facts: ApkFacts): string | null {
  const declared = facts.metaData[RUNTIME_VERSION_KEY];
  if (declared === undefined) return null;
  return runtimeIsFingerprint(declared) ? facts.fingerprint : declared;
}

function runtimeProblem(facts: ApkFacts): readonly ApkProblem[] {
  const declared = facts.metaData[RUNTIME_VERSION_KEY];
  if (declared === undefined) {
    return [problem('apk-identity', `the manifest has no ${RUNTIME_VERSION_KEY}`)];
  }
  if (runtimeVersionOf(facts) !== null) return [];
  return [
    problem(
      'apk-identity',
      `the manifest takes the runtime version from ${FINGERPRINT_ASSET} (${RUNTIME_VERSION_KEY} is ${declared || 'empty'}), but the APK has no such file or it is empty`,
    ),
  ];
}

function updateUrlProblem(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  const url = facts.metaData[UPDATE_URL_KEY];
  if (url === undefined || url === '') {
    return [
      problem('apk-identity', `the manifest has no ${UPDATE_URL_KEY}, so the app cannot update`),
    ];
  }
  const wanted =
    expected.server === undefined
      ? null
      : `${expected.server.replace(/\/$/u, '')}${UPDATE_MANIFEST_PATH}`;
  if (wanted === null) {
    return url.endsWith(UPDATE_MANIFEST_PATH)
      ? []
      : [
          problem(
            'apk-identity',
            `the update URL is ${url}, expected it to end with ${UPDATE_MANIFEST_PATH}`,
          ),
        ];
  }
  return url === wanted
    ? []
    : [problem('apk-identity', `the update URL is ${url}, expected ${wanted}`)];
}

export function updateProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  if (expected.variant !== 'release') return [];
  const certificate = facts.metaData[CODE_SIGNING_CERTIFICATE_KEY];
  return [
    ...updateUrlProblem(facts, expected),
    ...runtimeProblem(facts),
    ...(certificate === undefined || certificate === ''
      ? [
          problem(
            'apk-identity',
            `the manifest has no ${CODE_SIGNING_CERTIFICATE_KEY}, so update signatures cannot be checked`,
          ),
        ]
      : []),
  ];
}

export async function apkProblems(
  facts: ApkFacts,
  expected: ApkExpectation,
): Promise<readonly ApkProblem[]> {
  const declared = new Set(facts.permissions);
  const missingHealth = (await expectedHealthPermissions()).filter((name) => !declared.has(name));
  const unexplained = await unexplainedPermissions(facts);
  return [
    ...identityProblems(facts, expected),
    ...signingProblems(facts, expected),
    ...releaseProblems(facts, expected),
    ...updateProblems(facts, expected),
    ...(missingHealth.length === 0
      ? []
      : [
          problem(
            'apk-permissions',
            `${String(missingHealth.length)} Health Connect permissions are not declared, first ${missingHealth.slice(0, 3).join(', ')}`,
          ),
        ]),
    ...(unexplained.length === 0
      ? []
      : [
          problem(
            'apk-permissions',
            `permissions the privacy page does not explain: ${unexplained.join(', ')}`,
          ),
        ]),
  ];
}
