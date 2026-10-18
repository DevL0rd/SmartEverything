import type { ChatTimelineTool } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { cachedToolFileDiffs } from './tool-file-diffs';
import { toolOutcome, toolResultLine } from './tool-outcome';

function tool(output: string): ChatTimelineTool {
  return {
    callId: 'c1',
    name: 'bash',
    title: 'bash',
    detail: null,
    state: 'done',
    input: '{"command":"ls"}',
    output,
    redacted: false,
    image_operation_id: null,
  };
}

const BIG = JSON.stringify({ exit_code: 0, summary: 'ok', result: 'x'.repeat(60_000) });

describe('tool derived view cache', () => {
  it('returns identical outcome and line for the same tool object', () => {
    const done = tool(BIG);
    expect(toolOutcome(done, false)).toBe('done');
    expect(toolOutcome(done, true)).toBe('done');
    expect(toolResultLine(done, false)).toBe('ok');
  });

  it('keeps running tools live-dependent without caching the done branch', () => {
    const running = { ...tool(BIG), state: 'running' as const };
    expect(toolOutcome(running, true)).toBe('running');
    expect(toolOutcome(running, false)).toBe('unknown');
  });

  it('detects failures from the cached records', () => {
    const failed = tool(JSON.stringify({ exit_code: 2 }));
    expect(toolOutcome(failed, false)).toBe('failed');
    expect(toolResultLine(failed, false)).toBe('The command exited with code 2.');
  });

  it('reuses file diffs per tool and state', () => {
    const done = tool(BIG);
    const first = cachedToolFileDiffs(done, 'done');
    expect(cachedToolFileDiffs(done, 'done')).toBe(first);
    expect(cachedToolFileDiffs(done, 'failed')).not.toBe(first);
  });

  it('repeat reads of a 60 KB output are map lookups', () => {
    const done = tool(BIG);
    toolOutcome(done, false);
    const start = performance.now();
    for (let index = 0; index < 1000; index += 1) toolOutcome(done, false);
    const cached = performance.now() - start;
    const fresh = performance.now();
    for (let index = 0; index < 50; index += 1) toolOutcome(tool(BIG), false);
    const uncachedPerCall = (performance.now() - fresh) / 50;
    expect(cached / 1000).toBeLessThan(uncachedPerCall);
  });
});
