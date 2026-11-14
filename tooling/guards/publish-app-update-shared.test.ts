import { describe, expect, it, vi } from 'vitest';
import { outputTail, PublishCommandError, runCommand } from '../publish-app-update-shared.ts';

const node = (script: string): Parameters<typeof runCommand>[0] => ({
  title: 'run the probe',
  program: process.execPath,
  args: ['-e', script],
  cwd: process.cwd(),
  environment: {},
});

describe('publish command failures', () => {
  it('carries the title, the exit code and the tail of the output', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const failure = ((): PublishCommandError => {
      try {
        runCommand(
          node(
            "console.log('out line'); console.error('missing google-services.json'); process.exit(3)",
          ),
        );
      } catch (error) {
        if (error instanceof PublishCommandError) return error;
        throw error;
      }
      throw new Error('the probe did not fail');
    })();
    expect(failure).toMatchObject({ title: 'run the probe', status: 3 });
    expect(failure.message).toContain('missing google-services.json');
    expect(failure.message).toContain('out line');
  });

  it('reports a program that cannot start', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(() => runCommand({ ...node(''), program: '/nonexistent/tool-for-this-test' })).toThrow(
      /ENOENT/u,
    );
  });

  it('returns captured output on success', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(runCommand({ ...node("process.stdout.write('{}')"), captureOutput: true })).toBe('{}');
  });

  it('keeps the last twenty lines', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${String(index)}`).join('\n');
    const tail = outputTail(lines).split('\n');
    expect(tail).toHaveLength(20);
    expect(tail.at(-1)).toBe('line 29');
  });
});
