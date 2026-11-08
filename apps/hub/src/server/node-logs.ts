import {
  NODE_LOG_BATCH_BYTES,
  type ComputerNodeRow,
  type HubLogReceipt,
  type NodeLogsFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';

class NodeLogBatchSizeError extends Error {
  override readonly name = 'NodeLogBatchSizeError';

  constructor(readonly bytes: number) {
    super('The computer log batch exceeds the node log transport budget.');
  }
}

export function ingestNodeLogs(
  store: Pick<Store, 'runtimeLogs' | 'now'>,
  log: Logger,
  identity: ComputerNodeRow,
  frame: NodeLogsFrame,
): HubLogReceipt {
  const deviceId = identity.device_id;
  try {
    const bytes = Buffer.byteLength(JSON.stringify(frame.batch.records));
    if (bytes > NODE_LOG_BATCH_BYTES) throw new NodeLogBatchSizeError(bytes);
    store.runtimeLogs.ingest({
      access: { owner: true, profileId: null },
      batch: frame.batch,
      source: {
        source: `node:${deviceId}`,
        runtime: 'hub',
        platform: 'server',
        deviceId,
        clientId: null,
      },
      deviceId,
      now: store.now().toISOString(),
    });
    return { type: 'log_receipt', id: frame.id, stored: true };
  } catch (cause) {
    log.error('computer.logs_not_stored', cause, { deviceId });
    return { type: 'log_receipt', id: frame.id, stored: false };
  }
}
