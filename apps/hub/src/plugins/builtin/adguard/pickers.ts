import {
  type AdGuardSnapshot,
  type PluginOption,
  type PluginOptionPage,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { PluginContext, PluginOptionProvider } from '../contract';
import type { AdGuardClient } from './adguard-client';
import { CLIENTS_REPLY, type ClientsReply } from './api-schemas';
import { optionPage } from '../automation-kit-pages';

export const FILTER_PICKER = 'filters';
export const CLIENT_PICKER = 'clients';

const MESSAGE_MAX = 300;
const DETAIL_MAX = 200;

export interface PickerWorld {
  readonly snapshot: () => AdGuardSnapshot;
  readonly client: () => AdGuardClient;
}

function unavailable(message: string): PluginOptionPage {
  return { state: 'unavailable', message: message.slice(0, MESSAGE_MAX) };
}

function refusalOf(snapshot: AdGuardSnapshot): string | null {
  const { connection } = snapshot;
  switch (connection.state) {
    case 'not_set_up':
      return 'AdGuard Home is not set up yet. Add its address in the plugin settings.';
    case 'sign_in_needed':
      return 'AdGuard Home needs a user name and password in the plugin settings.';
    case 'connecting':
      return 'AdGuard Home is still connecting.';
    case 'refused':
      return `AdGuard Home refused the sign-in: ${connection.reason}`;
    case 'unreachable':
      return `AdGuard Home cannot be reached: ${connection.reason}`;
    case 'online':
    case 'paused':
      return null;
  }
}

function option(id: string, label: string, detail: string | null): PluginOption {
  return {
    id,
    label,
    detail: detail === null ? null : detail.slice(0, DETAIL_MAX),
    color: null,
    image: null,
  };
}

export function filterOptions(snapshot: AdGuardSnapshot): readonly PluginOption[] {
  return snapshot.filters.map((filter) =>
    option(
      String(filter.id),
      filter.name,
      `${filter.allowList ? 'Allow list' : 'Block list'}${filter.enabled ? '' : ' · off'}`,
    ),
  );
}

function configuredClients(reply: ClientsReply): readonly PluginOption[] {
  return (reply.clients ?? []).map((client) =>
    option(client.ids[0] ?? client.name, client.name, client.ids.join(', ')),
  );
}

function detectedClients(reply: ClientsReply): readonly PluginOption[] {
  return (reply.auto_clients ?? [])
    .map((client) =>
      client.name.length > 0
        ? option(client.ip, client.name, client.ip)
        : option(client.ip, client.ip, null),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

function busyClients(
  snapshot: AdGuardSnapshot,
  known: readonly PluginOption[],
): readonly PluginOption[] {
  const seen = new Set(known.flatMap((entry) => [entry.id, entry.label]));
  return (snapshot.stats?.topClients ?? [])
    .filter((entry) => !seen.has(entry.name))
    .map((entry) => option(entry.name, entry.name, null));
}

export function clientOptions(
  reply: ClientsReply,
  snapshot: AdGuardSnapshot,
): readonly PluginOption[] {
  const named = [...configuredClients(reply), ...detectedClients(reply)];
  const all = [...named, ...busyClients(snapshot, named)];
  return [...new Map(all.map((entry) => [entry.id, entry])).values()];
}

export function filterPicker(world: PickerWorld): PluginOptionProvider {
  return (query) => {
    const snapshot = world.snapshot();
    const refusal = refusalOf(snapshot);
    return Promise.resolve(
      refusal === null ? optionPage(filterOptions(snapshot), query) : unavailable(refusal),
    );
  };
}

export function clientPicker(world: PickerWorld): PluginOptionProvider {
  return async (query) => {
    const snapshot = world.snapshot();
    const refusal = refusalOf(snapshot);
    if (refusal !== null) return unavailable(refusal);
    try {
      const reply = await world.client().read('/control/clients', CLIENTS_REPLY);
      return optionPage(clientOptions(reply, snapshot), query);
    } catch (cause) {
      return unavailable(`AdGuard Home would not list its clients: ${messageOf(cause)}`);
    }
  };
}

export function registerAdGuardPickers(
  ctx: Pick<PluginContext<unknown>, 'options'>,
  world: PickerWorld,
): void {
  ctx.options.register(FILTER_PICKER, filterPicker(world));
  ctx.options.register(CLIENT_PICKER, clientPicker(world));
}
