import {
  DEFAULT_HOME_NAME,
  FIRST_PROFILE_NAME,
  fitnessReady,
  type SettingsRow,
} from '@smarteverything/domain';
import { activeProfileIn } from '../../../store/people';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type StoreState } from '../../../store/state';

type FirewallFact = 'unchecked' | 'none' | 'open' | 'missing';

type AddressFact = 'none' | 'unverified' | 'failing' | 'verified';

export interface StoreFacts {
  readonly owner: boolean;
  readonly homeNamed: boolean;
  readonly located: boolean;
  readonly ownerNamed: boolean;
  readonly firewall: FirewallFact;
  readonly address: AddressFact;
  readonly pushConfigured: boolean;
  readonly people: number;
  readonly phonePaired: boolean;
  readonly linkedAccounts: number;
  readonly devices: number;
  readonly unroomed: number;
  readonly assistants: number;
  readonly fitnessReady: boolean | null;
}

export interface SetupFacts extends StoreFacts {
  readonly homeOnly: boolean;
}

function firewallFact(state: StoreState): FirewallFact {
  const { firewall } = state;
  if (firewall === null) return 'unchecked';
  if (firewall.backend === 'none') return 'none';
  const closed = firewall.openings.some(
    (opening) => opening.state === 'missing' || opening.state === 'denied',
  );
  return closed || firewall.lowPorts?.state === 'missing' ? 'missing' : 'open';
}

function addressFact(state: StoreState): AddressFact {
  const settings = state.settings;
  if (settings === null) return 'none';
  if (settings.public_url === null) return 'none';
  if (settings.public_url_error !== null) return 'failing';
  return settings.public_url_verified_at === null ? 'unverified' : 'verified';
}

function ownerNamed(state: StoreState): boolean {
  const first = [...rowsOf(state.tables.profiles)].sort(
    (left, right) => left.position - right.position,
  )[0];
  return first !== undefined && first.name !== FIRST_PROFILE_NAME;
}

function homeFacts(
  settings: SettingsRow | null,
): Pick<StoreFacts, 'homeNamed' | 'located' | 'pushConfigured'> {
  return {
    homeNamed: (settings?.home_name ?? DEFAULT_HOME_NAME) !== DEFAULT_HOME_NAME,
    located: (settings?.latitude ?? null) !== null && (settings?.longitude ?? null) !== null,
    pushConfigured: (settings?.push_project_id ?? null) !== null,
  };
}

export function storeFactsOf(state: StoreState): StoreFacts {
  const settings = state.settings;
  const devices = rowsOf(state.tables.devices).filter((device) => !device.hidden);
  const profile = activeProfileIn(state);
  return {
    owner: state.session?.client.role === 'owner',
    ...homeFacts(settings),
    ownerNamed: ownerNamed(state),
    firewall: firewallFact(state),
    address: addressFact(state),
    people: state.tables.profiles.ids.length,
    phonePaired: rowsOf(state.tables.clients).some(
      (client) => client.platform === 'android' && !client.built_in,
    ),
    linkedAccounts: rowsOf(state.tables.provider_links).filter((link) => link.status === 'linked')
      .length,
    devices: devices.length,
    unroomed: devices.filter((device) => device.room_id === null).length,
    assistants:
      state.tables.oauth_clients.ids.length +
      rowsOf(state.tables.mcp_tokens).filter((token) => token.revoked_at === null).length,
    fitnessReady: profile === null ? null : fitnessReady(profile),
  };
}

export function sameStoreFacts(left: StoreFacts, right: StoreFacts): boolean {
  return sameJson(left, right);
}
