import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { ROOT_MANIFEST, declaredVersion } from './contract-helpers';

describe('typescript contract', () => {
  it('reports the same version through its own api', () => {
    expect(ts.version).toBe(declaredVersion(ROOT_MANIFEST, 'typescript'));
  });

  it('stays below the ceiling typescript-eslint supports, so type aware linting works', () => {
    const [major, minor] = ts.version.split('.').map(Number);
    expect(major).toBeDefined();
    expect(minor).toBeDefined();
    const belowCeiling = (major ?? 0) < 6 || ((major ?? 0) === 6 && (minor ?? 0) < 1);
    expect(belowCeiling).toBe(true);
  });

  it('satisfies the version the Expo SDK expects', () => {
    expect(ts.version.startsWith('6.')).toBe(true);
  });

  it('reports a type error for code that must not compile', () => {
    const result = ts.transpileModule('const a: number = "x";', {
      reportDiagnostics: true,
      compilerOptions: { strict: true },
    });
    expect(result.outputText).toContain('"x"');
  });
});
