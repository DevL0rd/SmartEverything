import { EventEmitter } from 'node:events';
import Bonjour, { type ServiceConfig } from 'bonjour-service';
import { mdnsEmitter, mdnsFor, type Mdns, type OpenMdns } from '../../src/network/mdns';

const noop = (): void => undefined;

class MemorySocket extends EventEmitter {
  constructor(
    private readonly network: MemoryNetwork,
    private readonly source: string,
  ) {
    super();
  }
  bind(_port: number, _interface: unknown, done: () => void): void {
    this.network.sockets.add(this);
    setImmediate(() => {
      this.emit('listening');
      done();
    });
  }
  address(): { address: string; port: number } {
    return { address: this.source, port: 5353 };
  }
  readonly addMembership = noop;
  readonly dropMembership = noop;
  readonly setMulticastTTL = noop;
  readonly setMulticastLoopback = noop;
  readonly setMulticastInterface = noop;
  send(message: Buffer, ...rest: [number, number, number, string, () => void]): void {
    for (const socket of this.network.sockets)
      setImmediate(() => {
        socket.emit('message', message, { address: this.source, port: 5353 });
      });
    rest[4]();
  }
  close(done: () => void): void {
    this.network.sockets.delete(this);
    done();
  }
}

export class MemoryNetwork {
  readonly sockets = new Set<MemorySocket>();
  readonly opened: Mdns[] = [];
  host(source: string): OpenMdns {
    return (failed) => {
      const options: Partial<ServiceConfig> & { socket: MemorySocket } = {
        socket: new MemorySocket(this, source),
      };
      const mdns = mdnsFor(new Bonjour(options, failed), failed);
      this.opened.push(mdns);
      return mdns;
    };
  }
  changeNetwork(mdns: Mdns): void {
    mdnsEmitter(mdns.bonjour).emit('networkInterface');
  }
}
