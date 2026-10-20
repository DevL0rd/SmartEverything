import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { describe, expect, it } from 'vitest';
import { automation, step } from '../../model/editor/editor-fixtures';
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

describe('live check budget', () => {
  it('checks and lints 200 nodes inside the 16 ms budget', () => {
    const program = automation(
      Array.from({ length: NODES }, (_, at) =>
        step(`step${String(at)}`, {
          value:
            at === 0 ? { lit: true } : { wire: { from: `step${String(at - 1)}`, port: 'value' } },
        }),
      ),
    );
    runLiveCheck(program, context, NODE_REGISTRY);
    const timings = Array.from({ length: RUNS }, () => {
      const started = performance.now();
      runLiveCheck(program, context, NODE_REGISTRY);
      return performance.now() - started;
    });
    expect(median(timings)).toBeLessThan(BUDGET_MS);
  });
});
