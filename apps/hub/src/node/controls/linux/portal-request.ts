import { randomBytes } from 'node:crypto';
import dbus from 'dbus-next';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { BusCall, SignalListener, SignalRule } from './dbus-session';

export interface PortalBus {
  readonly uniqueName: () => string;
  readonly call: (request: BusCall) => Promise<readonly unknown[]>;
  readonly watch: (rule: SignalRule, listener: SignalListener) => Promise<() => void>;
}

export const PORTAL_DESTINATION = 'org.freedesktop.portal.Desktop';
export const PORTAL_PATH = '/org/freedesktop/portal/desktop';
export const REMOTE_DESKTOP = 'org.freedesktop.portal.RemoteDesktop';
export const SCREEN_CAST = 'org.freedesktop.portal.ScreenCast';
const REQUEST = 'org.freedesktop.portal.Request';
const RESPONSE_OK = 0;
const RESPONSE_CANCELLED = 1;

const RESPONSE = z.tuple([z.number(), z.record(z.string(), z.unknown())]);

export type PortalResults = Readonly<Record<string, unknown>>;

export interface PortalCall {
  readonly iface: string;
  readonly member: string;
  readonly signature: string;
  readonly head: readonly unknown[];
  readonly options: Readonly<Record<string, dbus.Variant>>;
}

export function randomToken(): string {
  return `se${randomBytes(8).toString('hex')}`;
}

function requestPath(uniqueName: string, token: string): string {
  return `/org/freedesktop/portal/desktop/request/${uniqueName.slice(1).replaceAll('.', '_')}/${token}`;
}

function refusal(code: number, what: string): NodeFailureError {
  if (code === RESPONSE_CANCELLED) {
    return new NodeFailureError(
      'not_permitted',
      `The person on this computer declined remote control (${what}). Ask them to approve it when the desktop asks.`,
    );
  }
  return new NodeFailureError(
    'failed',
    `The desktop could not start remote control (${what}, answer ${String(code)}).`,
  );
}

export async function portalRequest(bus: PortalBus, call: PortalCall): Promise<PortalResults> {
  const token = randomToken();
  const path = requestPath(bus.uniqueName(), token);
  let answer: (response: z.infer<typeof RESPONSE>) => void = () => undefined;
  const response = new Promise<z.infer<typeof RESPONSE>>((resolve) => {
    answer = resolve;
  });
  const stop = await bus.watch({ iface: REQUEST, member: 'Response', path }, (body) => {
    answer(RESPONSE.parse(body));
  });
  try {
    await bus.call({
      destination: PORTAL_DESTINATION,
      path: PORTAL_PATH,
      iface: call.iface,
      member: call.member,
      signature: call.signature,
      body: [...call.head, { ...call.options, handle_token: new dbus.Variant('s', token) }],
    });
    const [code, results] = await response;
    if (code !== RESPONSE_OK) throw refusal(code, call.member);
    return results;
  } finally {
    stop();
  }
}
