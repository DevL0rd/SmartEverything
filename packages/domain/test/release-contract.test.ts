import { describe, expect, it } from 'vitest';
import {
  HUB_UPDATE_PHASES,
  RELEASE_MANIFEST,
  RELEASE_SIGNATURE,
  UPDATE_INPUT,
  type ReleaseFile,
  updateSourceProblem,
} from '../src';

const ID = '4f2c1a5e-7d3b-4e8a-9b1c-2d6f8a0e3c57';
const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

const COMMON = {
  version: '0.1.15',
  commit: SHA,
  notes: 'Fixes a thing.',
  files: [{ path: 'files/app.apk', size: 10, sha256: HASH, executable: false }],
  gate: { typeCheck: 'passed', commit: SHA },
};

const HUB = {
  artifact: 'hub',
  target: 'linux-x64',
  facts: { schemaMin: 1, schemaMax: 4, nodeVersion: '26.1.0' },
  ...COMMON,
};

const APK = {
  artifact: 'apk',
  target: 'android',
  facts: { applicationId: 'com.example.app', versionCode: '12', signerSha256: HASH },
  ...COMMON,
};

describe('update_control input', () => {
  it('accepts a provided hub release with its upload', () => {
    expect(
      UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x', source: 'provided', upload: ID }).success,
    ).toBe(true);
  });

  it('accepts a github release by tag or by commit, not both or neither', () => {
    const base = { action: 'ui', runId: ID, notes: 'x', source: 'github' };
    expect(UPDATE_INPUT.safeParse({ ...base, tag: 'v1.2.3' }).success).toBe(true);
    expect(UPDATE_INPUT.safeParse({ ...base, commit: SHA }).success).toBe(true);
    expect(UPDATE_INPUT.safeParse({ ...base, tag: 'v1', commit: SHA }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse(base).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...base, tag: 'v1', upload: ID }).success).toBe(false);
  });

  it('refuses a provided source without an upload or with a tag or commit', () => {
    const base = { action: 'app', runId: ID, notes: 'x', source: 'provided' };
    expect(UPDATE_INPUT.safeParse(base).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...base, upload: ID, tag: 'v1' }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...base, upload: ID, commit: SHA }).success).toBe(false);
  });

  it('allows the hub source only with an optional commit', () => {
    const base = { action: 'desktop', runId: ID, notes: 'x', arches: ['x64'], source: 'hub' };
    expect(UPDATE_INPUT.safeParse(base).success).toBe(true);
    expect(UPDATE_INPUT.safeParse({ ...base, commit: SHA }).success).toBe(true);
    expect(UPDATE_INPUT.safeParse({ ...base, upload: ID }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...base, tag: 'v1' }).success).toBe(false);
  });

  it('refuses source fields without a source and unknown fields', () => {
    expect(UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x', upload: ID }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x', extra: 1 }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x', source: 'cloud' }).success).toBe(
      false,
    );
    expect(UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x' }).success).toBe(true);
  });

  it('refuses tags that are not plain release tags', () => {
    for (const tag of ['a..b', '-v1', 'v1/x', 'v 1', 'v1.lock', 'v1.'])
      expect(
        UPDATE_INPUT.safeParse({ action: 'hub', notes: 'x', source: 'github', tag }).success,
      ).toBe(false);
  });

  it('reports the problem text', () => {
    expect(updateSourceProblem({ source: 'github' })).toMatch(/exactly one/u);
    expect(updateSourceProblem({})).toBeNull();
  });

  it('parses rollback', () => {
    expect(UPDATE_INPUT.safeParse({ action: 'rollback', artifact: 'hub', id: ID }).success).toBe(
      true,
    );
    expect(UPDATE_INPUT.safeParse({ action: 'rollback', artifact: 'rom', id: ID }).success).toBe(
      false,
    );
    expect(UPDATE_INPUT.safeParse({ action: 'rollback', artifact: 'hub' }).success).toBe(false);
  });

  it('parses release_keys operations strictly', () => {
    const key = 'A'.repeat(43) + '=';
    const trust = {
      action: 'release_keys',
      operation: 'trust',
      publicKey: key,
      role: 'machine',
      label: 'pc',
    };
    expect(UPDATE_INPUT.safeParse({ action: 'release_keys', operation: 'list' }).success).toBe(
      true,
    );
    expect(UPDATE_INPUT.safeParse(trust).success).toBe(true);
    expect(UPDATE_INPUT.safeParse({ ...trust, role: 'owner' }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...trust, label: undefined }).success).toBe(false);
    expect(UPDATE_INPUT.safeParse({ ...trust, fingerprint: HASH }).success).toBe(false);
    expect(
      UPDATE_INPUT.safeParse({ action: 'release_keys', operation: 'remove', fingerprint: HASH })
        .success,
    ).toBe(true);
    expect(UPDATE_INPUT.safeParse({ action: 'release_keys', operation: 'remove' }).success).toBe(
      false,
    );
    expect(
      UPDATE_INPUT.safeParse({ action: 'release_keys', operation: 'list', label: 'x' }).success,
    ).toBe(false);
  });

  it('takes the GitHub release token only with set', () => {
    const token = 'github_pat_read_only';
    const parse = (input: Readonly<Record<string, unknown>>): boolean =>
      UPDATE_INPUT.safeParse({ action: 'release_keys', ...input }).success;
    expect(parse({ operation: 'set', token })).toBe(true);
    expect(parse({ operation: 'set' })).toBe(false);
    expect(parse({ operation: 'set', token: 'has space' })).toBe(false);
    expect(parse({ operation: 'clear' })).toBe(true);
    expect(parse({ operation: 'clear', token })).toBe(false);
    expect(parse({ operation: 'list', token })).toBe(false);
    expect(parse({ operation: 'trust', token })).toBe(false);
  });
});

describe('ledger phases', () => {
  it('has awaiting_decision and no reverting', () => {
    expect(HUB_UPDATE_PHASES).toContain('awaiting_decision');
    expect(HUB_UPDATE_PHASES).not.toContain('reverting');
  });
});

describe('release manifest', () => {
  it('accepts a hub and an apk manifest', () => {
    expect(RELEASE_MANIFEST.safeParse(HUB).success).toBe(true);
    expect(RELEASE_MANIFEST.safeParse(APK).success).toBe(true);
  });

  it('accepts ui and desktop manifests', () => {
    expect(
      RELEASE_MANIFEST.safeParse({
        ...COMMON,
        artifact: 'ui',
        target: 'desktop',
        facts: { runtimeVersion: '1.0' },
      }).success,
    ).toBe(true);
    expect(
      RELEASE_MANIFEST.safeParse({
        ...COMMON,
        artifact: 'desktop',
        target: 'linux-arm64',
        facts: { version: '0.1.15', arches: ['arm64'] },
      }).success,
    ).toBe(true);
  });

  it('refuses unknown fields, wrong targets and facts of another artifact', () => {
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, extra: 1 }).success).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, target: 'android' }).success).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, facts: APK.facts }).success).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...APK, facts: { ...APK.facts, extra: 1 } }).success).toBe(
      false,
    );
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, artifact: 'rom' }).success).toBe(false);
  });

  it('refuses a gate for another commit or a failed gate', () => {
    expect(
      RELEASE_MANIFEST.safeParse({ ...HUB, gate: { typeCheck: 'passed', commit: 'c'.repeat(40) } })
        .success,
    ).toBe(false);
    expect(
      RELEASE_MANIFEST.safeParse({ ...HUB, gate: { typeCheck: 'failed', commit: SHA } }).success,
    ).toBe(false);
  });

  it('refuses unsafe, duplicate and empty file lists and bad hashes', () => {
    const file = (path: string): ReleaseFile => ({
      path,
      size: 1,
      sha256: HASH,
      executable: false,
    });
    for (const path of ['/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a\\b', '', 'a/'])
      expect(RELEASE_MANIFEST.safeParse({ ...HUB, files: [file(path)] }).success).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, files: [file('a'), file('a')] }).success).toBe(
      false,
    );
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, files: [] }).success).toBe(false);
    expect(
      RELEASE_MANIFEST.safeParse({
        ...HUB,
        files: [{ path: 'a', size: 1, sha256: 'xyz', executable: false }],
      }).success,
    ).toBe(false);
    expect(
      RELEASE_MANIFEST.safeParse({
        ...HUB,
        files: [{ path: 'a', size: -1, sha256: HASH, executable: false }],
      }).success,
    ).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, files: [file('a/b.js')] }).success).toBe(true);
  });

  it('refuses an empty schema range and a short commit', () => {
    expect(
      RELEASE_MANIFEST.safeParse({ ...HUB, facts: { ...HUB.facts, schemaMin: 9 } }).success,
    ).toBe(false);
    expect(RELEASE_MANIFEST.safeParse({ ...HUB, commit: 'abc' }).success).toBe(false);
  });
});

describe('release signature', () => {
  const signature = { algorithm: 'ed25519', fingerprint: HASH, signature: 'A'.repeat(86) + '==' };

  it('accepts a well formed signature', () => {
    expect(RELEASE_SIGNATURE.safeParse(signature).success).toBe(true);
  });

  it('refuses another algorithm, a bad fingerprint, a short signature and extra fields', () => {
    expect(RELEASE_SIGNATURE.safeParse({ ...signature, algorithm: 'rsa' }).success).toBe(false);
    expect(RELEASE_SIGNATURE.safeParse({ ...signature, fingerprint: 'abc' }).success).toBe(false);
    expect(RELEASE_SIGNATURE.safeParse({ ...signature, signature: 'AAAA' }).success).toBe(false);
    expect(RELEASE_SIGNATURE.safeParse({ ...signature, extra: 1 }).success).toBe(false);
  });
});
