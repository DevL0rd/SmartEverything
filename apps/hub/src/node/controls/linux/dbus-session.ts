import dbus, { type Message as BusMessage, type MessageBus } from 'dbus-next';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { sessionEnvironment } from './session-environment';

export interface BusTarget {
  readonly destination: string;
  readonly path: string;
  readonly iface: string;
}

export interface BusCall extends BusTarget {
  readonly member: string;
  readonly signature?: string;
  readonly body?: readonly unknown[];
}

export interface SignalRule {
  readonly sender?: string;
  readonly path?: string;
  readonly iface: string;
  readonly member: string;
}

export type SignalListener = (body: readonly unknown[], sender: string) => void;

export type MethodHandler = (body: readonly unknown[]) => void;

export function variant<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return z.object({ value: schema }).transform((wrapped): T => wrapped.value);
}

function ruleText(rule: SignalRule): string {
  const parts = [
    "type='signal'",
    `interface='${rule.iface}'`,
    `member='${rule.member}'`,
    ...(rule.sender === undefined ? [] : [`sender='${rule.sender}'`]),
    ...(rule.path === undefined ? [] : [`path='${rule.path}'`]),
  ];
  return parts.join(',');
}

function matches(message: BusMessage, rule: SignalRule): boolean {
  return (
    message.type === dbus.MessageType.SIGNAL &&
    message.interface === rule.iface &&
    message.member === rule.member &&
    (rule.path === undefined || message.path === rule.path)
  );
}

function bodyOf(message: BusMessage): readonly unknown[] {
  const body: unknown = message.body;
  return z.array(z.unknown()).parse(body);
}

export class SessionBus {
  private constructor(private readonly bus: MessageBus) {}

  static connect(): SessionBus {
    if (sessionEnvironment().DBUS_SESSION_BUS_ADDRESS === null) {
      throw new NodeFailureError('no_session', 'Nobody is signed in on this computer.');
    }
    return new SessionBus(dbus.sessionBus());
  }

  async call(request: BusCall): Promise<readonly unknown[]> {
    const reply = await this.bus.call(
      new dbus.Message({
        destination: request.destination,
        path: request.path,
        interface: request.iface,
        member: request.member,
        ...(request.signature === undefined ? {} : { signature: request.signature }),
        body: [...(request.body ?? [])],
      }),
    );
    return reply === null ? [] : bodyOf(reply);
  }

  async watch(rule: SignalRule, listener: SignalListener): Promise<() => void> {
    const text = ruleText(rule);
    const onMessage = (message: BusMessage): void => {
      if (matches(message, rule)) {
        listener(bodyOf(message), message.sender);
      }
    };
    this.bus.on('message', onMessage);
    await this.daemon('AddMatch', text);
    return (): void => {
      this.bus.removeListener('message', onMessage);
    };
  }

  async own(name: string): Promise<void> {
    const reply = await this.bus.requestName(name, dbus.NameFlag.DO_NOT_QUEUE);
    if (
      reply !== dbus.RequestNameReply.PRIMARY_OWNER &&
      reply !== dbus.RequestNameReply.ALREADY_OWNER
    ) {
      throw new NodeFailureError(
        'failed',
        'Another SmartEverything is already watching this desktop.',
      );
    }
  }

  serve(
    target: Omit<BusTarget, 'destination'>,
    methods: Readonly<Record<string, MethodHandler>>,
  ): () => void {
    const handler = (message: BusMessage): boolean => {
      const method =
        message.path === target.path && message.interface === target.iface
          ? methods[message.member]
          : undefined;
      if (method === undefined) {
        return false;
      }
      method(bodyOf(message));
      this.bus.send(dbus.Message.newMethodReturn(message, '', []));
      return true;
    };
    this.bus.addMethodHandler(handler);
    return (): void => {
      this.bus.removeMethodHandler(handler);
    };
  }

  close(): void {
    this.bus.disconnect();
  }

  private async daemon(member: 'AddMatch', rule: string): Promise<void> {
    await this.call({
      destination: 'org.freedesktop.DBus',
      path: '/org/freedesktop/DBus',
      iface: 'org.freedesktop.DBus',
      member,
      signature: 's',
      body: [rule],
    });
  }
}
