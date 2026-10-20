import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_METADATA_LIFETIME_MS,
  commandMetadata,
  CommandMetadataLog,
  metadataOf,
  stampOf,
} from '../../../src/automations/effects/command-metadata';
import type { CommandRow } from '@smarteverything/domain';
import { testRun, triggerWithDepth } from './support';

function row(): CommandRow {
  const at = '2026-10-08T12:00:00.000Z';
  return {
    id: randomUUID(),
    device_id: null,
    capability: 'power',
    value: true,
    status: 'pending',
    source: 'automation',
    result: null,
    error: null,
    requested_by: null,
    created_at: at,
    started_at: null,
    finished_at: null,
    expires_at: at,
  };
}

describe('command metadata', () => {
  it('builds the idempotency key from run, node path, iteration and attempt', () => {
    const run = testRun();
    const metadata = metadataOf(run, { nodePath: 'a.b', iteration: 3, attempt: 2 });
    expect(JSON.parse(metadata.idempotencyKey)).toStrictEqual([run.runId, 'a.b', 3, 2]);
    expect(metadata).toMatchObject({
      runId: run.runId,
      causeRunId: run.runId,
      causeAutomationId: run.automationId,
      causeDepth: 1,
      nodePath: 'a.b',
      iteration: 3,
      attempt: 2,
    });
  });

  it('places the commands one step deeper than the signal that started the run', () => {
    const metadata = metadataOf(testRun(triggerWithDepth(2)), stampOf('node'));
    expect(metadata.causeDepth).toBe(3);
    expect(metadataOf(testRun(), stampOf(null)).nodePath).toBeNull();
  });

  it('forgets a stamp once a command can no longer be matched to a state change', () => {
    const log = new CommandMetadataLog();
    const first = row();
    const second = row();
    const metadata = metadataOf(testRun(), stampOf('node'));
    log.stamp([first], metadata, 1_000);
    expect(log.of(first.id, 1_000 + COMMAND_METADATA_LIFETIME_MS - 1)).toBe(metadata);
    expect(log.of(first.id, 1_000 + COMMAND_METADATA_LIFETIME_MS)).toBeUndefined();
    log.stamp([second], metadata, 1_000 + COMMAND_METADATA_LIFETIME_MS + 5);
    expect(log.of(first.id, 1_000)).toBeUndefined();
    expect(log.of(second.id, 1_000 + COMMAND_METADATA_LIFETIME_MS + 6)).toBe(metadata);
  });

  it('gives each store one log', () => {
    const store = {};
    expect(commandMetadata(store)).toBe(commandMetadata(store));
    expect(commandMetadata({})).not.toBe(commandMetadata(store));
  });
});
