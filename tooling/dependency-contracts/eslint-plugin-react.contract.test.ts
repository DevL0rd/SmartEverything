import { describe, expect, it } from 'vitest';
import react from 'eslint-plugin-react';
import { readFileSync } from 'node:fs';
import { itIsPinnedToItsDeclaredVersion } from './contract-helpers';
import { repositoryFile } from './versions';

describe('eslint-plugin-react contract', () => {
  itIsPinnedToItsDeclaredVersion('eslint-plugin-react');

  it('exposes the flat configs the app is linted with', () => {
    expect(react.configs.flat['recommended']).toBeDefined();
    expect(react.configs.flat['jsx-runtime']).toBeDefined();
  });

  it('is given an explicit react version, because detection breaks on ESLint 10', () => {
    const config = readFileSync(repositoryFile('eslint.config.js'), 'utf8');
    expect(config).toContain("settings: { react: { version: '19.2.3' } }");
    expect(config).not.toContain("version: 'detect'");
  });
});
