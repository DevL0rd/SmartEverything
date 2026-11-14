import type { ChannelClosure, SyncSocketSink } from '../drive-sync/socket.js';
import type { SyncHubMessage } from '@smarteverything/domain/drive-sync';

export class SocketRouter implements SyncSocketSink {
  private readonly sinks = new Map<string, SyncSocketSink>();

  route(placementId: string, sink: SyncSocketSink): () => void {
    this.sinks.set(placementId, sink);
    return () => {
      if (this.sinks.get(placementId) === sink) this.sinks.delete(placementId);
    };
  }

  opened(placementId: string): void {
    this.sinks.get(placementId)?.opened(placementId);
  }

  message(placementId: string, message: SyncHubMessage): void {
    this.sinks.get(placementId)?.message(placementId, message);
  }

  closed(placementId: string, closure: ChannelClosure): void {
    this.sinks.get(placementId)?.closed(placementId, closure);
  }
}
