import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../publish-app-update-shared.ts';
import { runStep, type StepRequest } from '../self-update-commands.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const STEP_FILE = join(ROOT, 'tooling', 'self-update-step.ts');
const RUN = {
  name: 'fixture',
  program: process.execPath,
  args: ['-e', "process.stdout.write(process.env['RELEASE_STEP_FIXTURE']);"],
  cwd: ROOT,
} as const;

describe('running release commands', () => {
  it('returns text only when publisher output is captured', () => {
    const command = {
      title: 'publisher fixture',
      program: process.execPath,
      args: ['-e', "process.stdout.write(process.env['RELEASE_STEP_FIXTURE']);"],
      cwd: ROOT,
      environment: { RELEASE_STEP_FIXTURE: 'published' },
    };
    expect(runCommand({ ...command, captureOutput: true })).toBe('published');
    expect(runCommand({ ...command, args: ['-e', ''] })).toBe('');
  });

  it('forwards environment overrides and keeps output from the child', () => {
    const request: StepRequest = {
      tag: 'self-update',
      environment: { RELEASE_STEP_FIXTURE: 'built' },
      steps: [{ ...RUN, args: [...RUN.args] }],
    };
    expect(runStep(process.execPath, STEP_FILE, ROOT, request)).toEqual({
      status: 0,
      output: 'builtself-update: fixture\n',
    });
  });

  it('reports an unavailable launcher without inventing output', () => {
    const missingNode = join(import.meta.dirname, 'missing-node-executable');
    const outcome = runStep(missingNode, STEP_FILE, ROOT, {
      tag: 'self-update',
      environment: {},
      steps: [],
    });
    expect(outcome.status).toBe(1);
    expect(outcome.output).toContain('ENOENT');
  });

  it('names the program that could not start instead of failing without output', () => {
    const request: StepRequest = {
      tag: 'self-update',
      environment: {},
      steps: [{ ...RUN, program: join(ROOT, 'missing-program'), args: [] }],
    };
    const result = runStep(process.execPath, STEP_FILE, ROOT, request);
    expect(result.status).toBe(1);
    expect(result.output).toContain('missing-program');
  });

  it('rejects a malformed request before launching its first command', () => {
    const request = {
      tag: 'self-update',
      environment: { RELEASE_STEP_FIXTURE: 'must not run' },
      steps: [RUN, { ...RUN, cwd: 42 }],
    };
    const result = spawnSync(process.execPath, [STEP_FILE, JSON.stringify(request)], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('ZodError');
  });
});
