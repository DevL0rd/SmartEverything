import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const ROOT = join(import.meta.dirname, '..');

const BUILD_TOOLS_TIMEOUT_MS = 120_000;
const DEBUG_CERTIFICATE = 'CN=Android Debug';
const DEV_LAUNCHER_CLASS = 'Lexpo/modules/devlauncher/';
const OWN_PERMISSION_SUFFIX = '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION';

const HEALTH_PLUGIN = join(
  ROOT,
  'apps',
  'app',
  'modules',
  'health-connect',
  'plugin',
  'with-health-connect.ts',
);
const PRIVACY_SECTIONS = join(ROOT, 'apps', 'hub', 'src', 'extensions', 'privacy', 'sections.ts');

const HEALTH_PERMISSIONS = z.object({ HEALTH_CONNECT_PERMISSIONS: z.array(z.string().min(1)) });
const PRIVACY_TOPICS = z.object({
  PRIVACY_PERMISSION_TOPICS: z.record(z.string(), z.string()),
  LAUNCHER_BADGE_PERMISSION: z.instanceof(RegExp),
  HEALTH_CONNECT_PERMISSION_PREFIX: z.string(),
});

export type ApkVariant = 'release' | 'development';

export interface ApkFacts {
  readonly file: string;
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
  readonly debuggable: boolean;
  readonly permissions: readonly string[];
  readonly signerDistinguishedName: string | null;
  readonly signatureVerifies: boolean;
  readonly includesDevLauncher: boolean;
}

export interface ApkExpectation {
  readonly variant: ApkVariant;
  readonly storeIdentity: string;
  readonly versionName: string;
  readonly versionCodeAbove: number;
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

export function androidHome(): string {
  return process.env['ANDROID_HOME'] ?? join(homedir(), 'Android', 'Sdk');
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
  const header = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/mu.exec(text);
  if (header === null) throw new ApkReadError('aapt2', 'the badging output has no package line');
  const [, packageName = '', versionCode = '0', versionName = ''] = header;
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
  return /^Signer #1 certificate DN: (.+)$/mu.exec(text)?.[1]?.trim() ?? null;
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

export function readApk(file: string): ApkFacts {
  const badging = run(buildTool('aapt2'), ['dump', 'badging', file]);
  if (badging.status !== 0) throw new ApkReadError('aapt2', badging.text);
  const signature = run(buildTool('apksigner'), ['verify', '--print-certs', file]);
  return {
    file,
    ...parseBadging(badging.text),
    signerDistinguishedName: parseSigner(signature.text),
    signatureVerifies: signature.status === 0,
    includesDevLauncher: containsDevLauncher(file),
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

function signedWithOwnKey(facts: ApkFacts): boolean {
  return (
    facts.signatureVerifies &&
    facts.signerDistinguishedName !== null &&
    !facts.signerDistinguishedName.includes(DEBUG_CERTIFICATE)
  );
}

export function identityProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  const suffix = expected.variant === 'release' ? '' : '.dev';
  const packageName = `${expected.storeIdentity}${suffix}`;
  return [
    ...(facts.packageName === packageName
      ? []
      : [problem('apk-identity', `package is ${facts.packageName}, expected ${packageName}`)]),
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

export function releaseProblems(facts: ApkFacts, expected: ApkExpectation): readonly ApkProblem[] {
  if (expected.variant !== 'release') return [];
  return [
    ...(facts.debuggable ? [problem('apk-not-debuggable', 'the release APK is debuggable')] : []),
    ...(facts.includesDevLauncher
      ? [problem('apk-not-debuggable', 'the release APK contains the Expo dev launcher')]
      : []),
    ...(signedWithOwnKey(facts)
      ? []
      : [
          problem(
            'apk-signed',
            'the release APK is signed with the debug key, unsigned or does not verify',
          ),
        ]),
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
    ...releaseProblems(facts, expected),
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
