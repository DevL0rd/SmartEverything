import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { z } from 'zod';
import { declaredVersion, installedVersion, repositoryFile } from './versions';

export function itIsPinnedToItsDeclaredVersion(packageName: string): void {
  it('is installed at exactly the declared version', () => {
    expect(installedVersion(packageName)).toBe(declaredVersion(packageName));
  });
}

export function itMatchesTheVersionOf(packageName: string, peerName: string): void {
  it(`matches the ${peerName} version, which it requires`, () => {
    expect(installedVersion(packageName)).toBe(installedVersion(peerName));
  });
}

export function readRepositoryJson<TSchema extends z.ZodType>(
  relativePath: string,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(JSON.parse(readFileSync(repositoryFile(relativePath), 'utf8')));
}
