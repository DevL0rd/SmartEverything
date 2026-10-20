import type { RemoteEarNodeMessage } from '@smarteverything/domain';
import { HubRemoteEars } from '../../src/listening/remote-ears';
import type { EarHostFrame } from '../../src/listening/ear-hosts';
import { systemClock } from '../../src/clock';
import { wakeEarEngine } from '../../src/node/ear/ear-engine';
import { EarHost } from '../../src/node/ear/ear-host';
import { WakeKeywords, type EarKeywords } from '../../src/wake-name/keyword-lines';
import type { WakeGrant } from '../../src/wake-name/wake-claims';
import { testLogger } from '../support/logs';

const COMPUTER = 'loopback';

interface Relayed {
  readonly computerId: string;
  readonly key: string;
  readonly message: RemoteEarNodeMessage;
}

export interface Loopback {
  readonly ears: HubRemoteEars;
  readonly stop: () => Promise<void>;
}

export function earLoopback(names: readonly string[]): Loopback {
  const relayed = new Set<(relayed: Relayed) => void>();
  const host = new EarHost(
    {
      engine: wakeEarEngine(),
      clock: { now: (): Date => new Date(), at: systemClock.at },
      log: testLogger('node-ear'),
    },
    (key, message): void => {
      relayed.forEach((listener) => {
        listener({ computerId: COMPUTER, key, message });
      });
    },
    (): void => undefined,
    (): void => undefined,
  );
  const keywords = new WakeKeywords();
  const ears = new HubRemoteEars({
    hosts: {
      host: (): string => COMPUTER,
      sendTo: (_computerId, frame: EarHostFrame): boolean => {
        host.receive(frame);
        return true;
      },
      onMove: (): (() => void) => (): void => undefined,
      onRelayed: (listener): (() => void) => {
        relayed.add(listener);
        return (): void => {
          relayed.delete(listener);
        };
      },
    },
    claims: { request: (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined }) },
    test: { near: (): void => undefined },
    pause: { ms: (): 200 => 200, onChange: (): (() => void) => (): void => undefined },
    names: (): string[] => [...names],
    keywords: (given, sensitivity): EarKeywords => keywords.earConfig(given, sensitivity),
    clock: { now: (): Date => new Date() },
    log: testLogger('listening'),
  });
  ears.start();
  return {
    ears,
    stop: async (): Promise<void> => {
      ears.stop();
      await host.stop();
    },
  };
}
