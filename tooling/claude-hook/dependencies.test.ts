import { describe, expect, it } from 'vitest';
import { changesDependencies } from './dependencies.ts';

describe('changesDependencies', () => {
  it.each([
    'pnpm add zod',
    'pnpm -w install',
    'cd apps/hub && pnpm up esbuild',
    'pnpm remove left-pad; echo done',
    'pnpm config set strict-peer-dependencies true',
    'pnpm audit --fix',
    'pnpm patch-commit /tmp/x',
  ])('detects %s', (command) => {
    expect(changesDependencies(command)).toBe(true);
  });

  it.each([
    'pnpm run build',
    'pnpm exec vitest run',
    'pnpm audit',
    'pnpm config get registry',
    'pnpm why zod',
    'npm install',
    'git status && ls',
  ])('ignores %s', (command) => {
    expect(changesDependencies(command)).toBe(false);
  });
});
