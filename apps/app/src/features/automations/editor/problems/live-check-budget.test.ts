import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { describe, expect, it } from 'vitest';
import { automation, note, start } from '../../model/graph/graph-scene-fixtures';
import { runLiveCheck } from './problem-model';

const context: LintContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
  references: () => true,
  functions: () => undefined,
  secrets: new Set(),
  automations: () => undefined,
};

const NODES = 200;
const RUNS = 25;
const BUDGET_MS = 16;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function longChain(): ReturnType<typeof automation> {
  const keys = Array.from({ length: NODES }, (_, at) => `step${String(at)}`);
  return automation(
    [
      start(keys[0]),
      ...keys.map((key, at) =>
        note(key, keys[at + 1], {
          ports: {
            message:
              at === 0 ? { lit: 'go' } : { wire: { from: `step${String(at - 1)}`, port: 'value' } },
          },
        }),
      ),
    ],
    { triggers: [] },
  );
}

describe('live check budget', () => {
  it('checks and lints 200 nodes inside the 16 ms budget', () => {
    runLiveCheck(longChain(), context, NODE_REGISTRY);
    const timings = Array.from({ length: RUNS }, () => {
      const program = structuredClone(longChain());
      const started = performance.now();
      runLiveCheck(program, context, NODE_REGISTRY);
      return performance.now() - started;
    });
    expect(median(timings)).toBeLessThan(BUDGET_MS);
  });
});
