import { AI_REPAIR_PATCH_REQUEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  repairSourceDigest,
  validatedRepairPatch,
  type RepairPatch,
} from '../../src/assistant/repair-source';

const path = 'apps/hub/src/service/startup-journal.ts';
const source = 'function start() {\n  return false;\n}\n';
const digest = repairSourceDigest(source);
const revision = 'a'.repeat(40);
const requestId = 'e9178622-4bbd-4144-a453-4264ec41d67f';

const approved = { path, digest, text: source };
const patch: RepairPatch = {
  revision,
  sources: [approved],
};

describe('approved repair proposals', () => {
  it('retains only approved source paths and exact source bytes', () => {
    expect(validatedRepairPatch(patch)).toEqual(patch);
    expect(() =>
      validatedRepairPatch({ ...patch, sources: [{ path, digest, text: source + source }] }),
    ).toThrow(/snapshot changed/u);
    expect(() => validatedRepairPatch({ ...patch, sources: [approved, approved] })).toThrow();
  });

  it('requires explicit scope and excludes traversal and out-of-scope files', () => {
    const base = { requestId, revision, paths: [path] };
    expect(AI_REPAIR_PATCH_REQUEST.safeParse(base).success).toBe(true);
    for (const unsafe of [
      '/etc/passwd',
      'apps/hub/src/../secret.ts',
      '.git/config',
      'apps/hub/dist/run.ts',
    ]) {
      expect(AI_REPAIR_PATCH_REQUEST.safeParse({ ...base, paths: [unsafe] }).success).toBe(false);
    }
    expect(AI_REPAIR_PATCH_REQUEST.safeParse({ ...base, paths: [path, path] }).success).toBe(false);
    expect(AI_REPAIR_PATCH_REQUEST.safeParse({ ...base, provider: 'openrouter' }).success).toBe(
      false,
    );
  });
});
