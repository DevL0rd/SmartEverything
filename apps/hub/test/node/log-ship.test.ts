import { setImmediate as nextTurn } from 'node:timers/promises';
import { NODE_LOG_BATCH_BYTES, type NodeLogsFrame } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import { NodeLogShip, shipNodeLogs } from '../../src/node/log-ship';
import { captureLogs, testLogger } from '../support/logs';

function record(index: number, payload: Readonly<Record<string, unknown>> = {}): void {
  testLogger('node').warn('sample.warning', { index, ...payload });
}

describe('shipping node logs', () => {
  it('ships offline records once the node is welcomed and waits for the matching receipt', async () => {
    captureLogs();
    const ship = new NodeLogShip();
    const stop = shipNodeLogs(ship);
    const sent: NodeLogsFrame[] = [];
    try {
      record(1, { password: 'a secret' });
      record(2);
      await nextTurn();
      expect(sent).toEqual([]);
      ship.connected((frame) => {
        sent.push(frame);
      });
      await nextTurn();
      const first = sent[0];
      if (first === undefined) throw new Error('Expected one queued frame.');
      expect(first.batch.records.map((entry) => entry.payload['index'])).toEqual([1, 2]);
      expect(JSON.stringify(first)).not.toContain('a secret');
      record(3);
      await nextTurn();
      expect(sent).toEqual([first]);

      ship.disconnected();
      ship.connected((frame) => {
        sent.push(frame);
      });
      await nextTurn();
      expect(sent).toEqual([first, first]);
      ship.receive({ type: 'log_receipt', id: first.id, stored: true });
      await nextTurn();
      expect(sent[2]?.batch.records.map((entry) => entry.payload['index'])).toEqual([3]);
    } finally {
      stop();
      Logger.reset();
    }
  });

  it('keeps transport diagnostics local and stops draining when the hub refuses a batch', async () => {
    const captured = captureLogs();
    const ship = new NodeLogShip();
    const stop = shipNodeLogs(ship);
    const sent: NodeLogsFrame[] = [];
    try {
      ship.connected((frame) => {
        sent.push(frame);
        ship.receive({ type: 'log_receipt', id: frame.id, stored: false });
      });
      record(1);
      await nextTurn();
      record(2);
      await nextTurn();
      expect(sent).toHaveLength(1);
      expect(captured.events()).toContain('logs.not_stored');
      ship.connected((frame) => {
        sent.push(frame);
        ship.receive({ type: 'log_receipt', id: frame.id, stored: true });
      });
      await nextTurn();
      await nextTurn();
      await nextTurn();
      expect(sent.map((frame) => frame.batch.records.map((entry) => entry.event))).toEqual([
        ['sample.warning'],
        ['sample.warning'],
        ['sample.warning'],
      ]);
    } finally {
      stop();
      Logger.reset();
    }
  });

  it('drops the oldest offline records when the byte buffer fills and reports the loss', async () => {
    captureLogs();
    const ship = new NodeLogShip();
    const stop = shipNodeLogs(ship);
    const sent: NodeLogsFrame[] = [];
    try {
      const detail = 'é'.repeat(1500);
      for (let index = 0; index < 500; index += 1) record(index, { detail });
      ship.connected((frame) => {
        sent.push(frame);
      });
      await nextTurn();
      const first = sent[0];
      if (first === undefined) throw new Error('Expected a log batch.');
      expect(first.batch.dropped).toBeGreaterThan(0);
      expect(first.batch.oldestSentAt).toBeDefined();
      expect(Buffer.byteLength(JSON.stringify(first.batch.records))).toBeLessThanOrEqual(
        NODE_LOG_BATCH_BYTES,
      );
      expect(first.batch.records[0]?.payload['index']).toBe(first.batch.dropped);
    } finally {
      stop();
      Logger.reset();
    }
  });
});
