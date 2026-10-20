import type { AdapterSink } from '@smarteverything/domain';

class SinkMissingError extends Error {
  override readonly name = 'SinkMissingError';

  constructor() {
    super('The bottle driver has not started, so there is no place to publish state.');
  }
}

export class SinkSlot {
  private current: AdapterSink | null = null;

  set(sink: AdapterSink | null): void {
    this.current = sink;
  }

  require(): AdapterSink {
    if (this.current === null) {
      throw new SinkMissingError();
    }
    return this.current;
  }
}
