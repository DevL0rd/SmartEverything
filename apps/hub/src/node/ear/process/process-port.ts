import type { RemoteEarNodeMessage } from '@smarteverything/domain';
import type { EarHostPort, EarsFrame } from '../ear-host';
import type { EarProcess, EarSession } from './ear-process';
import type { PortSink } from './process-events';
import { EAR_CALL, EAR_COMMAND } from './protocol';

export interface PortCallbacks {
  readonly send: (key: string, message: RemoteEarNodeMessage) => void;
  readonly scored: (id: string, heard: boolean) => void;
  readonly scoreFailed: (id: string, reason: string) => void;
}

interface Tracked {
  readonly open: EarsFrame;
  policy: readonly EarsFrame[];
}

const RESTARTED = 'The ear process restarted before it scored the speech';

function policyAfter(policy: readonly EarsFrame[], frame: EarsFrame): readonly EarsFrame[] {
  if (frame.type !== 'ears') {
    return policy;
  }
  switch (frame.ear.kind) {
    case 'config':
      return [frame];
    case 'rest':
      return [...policy.filter((one) => one.type === 'ears' && one.ear.kind === 'config'), frame];
    case 'superseded':
      return policy;
  }
}

export class EarProcessPort implements EarHostPort, EarSession {
  private readonly tracked = new Map<string, Tracked>();
  private readonly scoring = new Set<string>();
  private readonly closing = new Set<string>();

  constructor(
    private readonly process: EarProcess,
    private readonly id: number,
    private readonly callbacks: PortCallbacks,
  ) {
    process.sinks.ports.set(id, this.sink());
    process.attach(this);
  }

  load(): Promise<void> {
    return this.process.load();
  }

  receive(frame: EarsFrame): void {
    this.track(frame);
    this.process.command(EAR_COMMAND.frame, { port: this.id, frame });
  }

  async stop(): Promise<void> {
    this.tracked.clear();
    this.process.detach(this);
    try {
      if (this.process.ready) {
        await this.process.call(EAR_CALL.portStop, { port: this.id });
      }
    } finally {
      this.process.sinks.ports.delete(this.id);
    }
  }

  replay(): Promise<void> {
    for (const tracked of this.tracked.values()) {
      for (const frame of [tracked.open, ...tracked.policy]) {
        this.process.command(EAR_COMMAND.frame, { port: this.id, frame });
      }
    }
    return Promise.resolve();
  }

  crashed(): void {
    for (const id of this.scoring) {
      this.callbacks.scoreFailed(id, RESTARTED);
    }
    this.scoring.clear();
    for (const key of this.closing) {
      this.callbacks.send(key, { kind: 'closed' });
    }
    this.closing.clear();
  }

  private track(frame: EarsFrame): void {
    switch (frame.type) {
      case 'ears_open':
        this.tracked.set(frame.source.key, { open: frame, policy: [] });
        this.closing.delete(frame.source.key);
        return;
      case 'ears_close':
        this.tracked.delete(frame.key);
        this.closing.add(frame.key);
        return;
      case 'ears_score':
        this.scoring.add(frame.id);
        return;
      case 'ears': {
        const tracked = this.tracked.get(frame.key);
        if (tracked !== undefined) {
          tracked.policy = policyAfter(tracked.policy, frame);
        }
        return;
      }
      case 'ears_audio':
        return;
    }
  }

  private sink(): PortSink {
    return {
      send: (key, message): void => {
        if (message.kind === 'closed') {
          this.closing.delete(key);
        }
        this.callbacks.send(key, message);
      },
      scored: (id, heard): void => {
        this.scoring.delete(id);
        this.callbacks.scored(id, heard);
      },
      scoreFailed: (id, reason): void => {
        this.scoring.delete(id);
        this.callbacks.scoreFailed(id, reason);
      },
    };
  }
}
