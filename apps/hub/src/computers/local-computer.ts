import type { AdapterSink, HubFrame, NodeFrame } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ComputerNode } from '../node/computer-node';
import { collectorFor } from '../node/collectors/collector';
import { controlsFor } from '../node/controls/controls';
import { pipeLink, type NodeLink } from '../node/link';
import { HUB_EXTERNAL_ID } from './computer-device';
import type { ComputerDriverOptions } from './computer-driver';
import { ComputerSession } from './computer-session';

export type LocalComputerFactory = (link: NodeLink) => Pick<ComputerNode, 'start' | 'stop'>;

export function localComputerFactory(options: {
  readonly machineId: string;
  readonly now: () => Date;
  readonly log: Logger;
}): LocalComputerFactory {
  return (link) =>
    new ComputerNode({
      collector: collectorFor(process.platform, {
        log: options.log,
        machineId: options.machineId,
        now: () => options.now().getTime(),
      }),
      controls: controlsFor(process.platform, { ...options, role: 'hub' }),
      link,
      now: options.now,
      log: options.log,
    });
}

export function startLocalComputer(options: ComputerDriverOptions, sink: AdapterSink): () => void {
  const node = pipeLink<NodeFrame, HubFrame>((frame) => {
    hub.deliver(frame);
  });
  const hub = pipeLink<HubFrame, unknown>((frame) => {
    node.deliver(frame);
  });
  const session = new ComputerSession({
    ...options,
    identity: { externalId: HUB_EXTERNAL_ID, role: 'hub' },
    link: hub.link,
    sink,
  });
  const leave = options.directory.add(session);
  try {
    const computer = options.createLocal(node.link);
    computer.start();
    return (): void => {
      computer.stop();
      session.stop();
      leave();
    };
  } catch (cause) {
    session.stop();
    leave();
    throw cause;
  }
}
