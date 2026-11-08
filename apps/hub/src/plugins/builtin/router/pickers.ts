import {
  type NetworkClient,
  type PluginOption,
  type PresencePerson,
  type RouterSnapshot,
} from '@smarteverything/domain';
import type { PluginContext, PluginOptionProvider } from '../contract';
import { CLIENT_PICKER, PEOPLE_PICKER } from './automation-parts';
import { optionPage } from '../automation-kit-pages';

const TEXT_MAX = 200;

const NOT_SET_UP = 'The router is not set up yet. Add its address in the plugin settings.';

export interface PickerWorld {
  readonly snapshot: () => RouterSnapshot;
}

function fit(text: string): string {
  return text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text;
}

function option(id: string, label: string, detail: string | null): PluginOption {
  return {
    id: fit(id),
    label: fit(label === '' ? id : label),
    detail: detail === null ? null : fit(detail),
    color: null,
    image: null,
  };
}

function connectionOf(client: NetworkClient): string {
  if (!client.connected) return 'offline';
  if (client.connection === 'wifi') return client.band === null ? 'Wi-Fi' : `Wi-Fi ${client.band}`;
  return client.connection === 'wired' ? 'wired' : 'online';
}

function clientDetail(client: NetworkClient): string {
  return [client.ip, connectionOf(client)].filter((part) => part !== null).join(' · ');
}

export function clientOptions(snapshot: RouterSnapshot): readonly PluginOption[] {
  return snapshot.clients
    .map((client) => ({ client, entry: option(client.mac, client.name, clientDetail(client)) }))
    .sort(
      (left, right) =>
        Number(right.client.connected) - Number(left.client.connected) ||
        left.entry.label.localeCompare(right.entry.label),
    )
    .map(({ entry }) => entry);
}

function personDetail(person: PresencePerson): string {
  if (!person.tracked) return 'Not tracked';
  return person.home ? 'Home' : 'Away';
}

export function peopleOptions(snapshot: RouterSnapshot): readonly PluginOption[] {
  return snapshot.people.map((person) => option(person.id, person.name, personDetail(person)));
}

function pickerOf(
  world: PickerWorld,
  optionsOf: (snapshot: RouterSnapshot) => readonly PluginOption[],
): PluginOptionProvider {
  return (query) => {
    const snapshot = world.snapshot();
    return Promise.resolve(
      snapshot.connection.state === 'not_set_up'
        ? { state: 'unavailable', message: NOT_SET_UP }
        : optionPage(optionsOf(snapshot), query),
    );
  };
}

export function registerRouterPickers(
  ctx: Pick<PluginContext<unknown>, 'options'>,
  world: PickerWorld,
): void {
  ctx.options.register(CLIENT_PICKER, pickerOf(world, clientOptions));
  ctx.options.register(PEOPLE_PICKER, pickerOf(world, peopleOptions));
}
