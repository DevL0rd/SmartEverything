import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import type { SetupFacts } from './facts';

export const SETUP_AREAS = [
  'home',
  'network',
  'people',
  'accounts',
  'assistants',
  'fitness',
] as const;

export type SetupArea = (typeof SETUP_AREAS)[number];

export const AREA_TITLES: Readonly<Record<SetupArea, string>> = {
  home: 'Your home',
  network: 'Reaching your home',
  people: 'People and phones',
  accounts: 'Accounts and devices',
  assistants: 'AI assistants',
  fitness: 'Fitness',
};

export type SetupPriority = 'required' | 'recommended' | 'optional';

export type SetupItemId =
  | 'home.named'
  | 'home.location'
  | 'people.owner_named'
  | 'network.firewall'
  | 'network.remote'
  | 'network.push'
  | 'people.second'
  | 'people.phone_paired'
  | 'accounts.linked'
  | 'accounts.rooms'
  | 'assistants.connected'
  | 'fitness.about';

export type RawState = 'done' | 'todo' | 'not_applicable';

export interface SetupItem {
  readonly id: SetupItemId;
  readonly area: SetupArea;
  readonly priority: SetupPriority;
  readonly owner: boolean;
  readonly icon: IconName;
  readonly title: string;
  readonly doneText: string;
  readonly todoText: string;
  readonly action: string;
  readonly go: Href;
  readonly stateOf: (facts: SetupFacts) => RawState;
}

const done = (ready: boolean): RawState => (ready ? 'done' : 'todo');

function firewallState(facts: SetupFacts): RawState {
  if (facts.firewall === 'none' || facts.firewall === 'unchecked') return 'not_applicable';
  return done(facts.firewall === 'open');
}

function remoteState(facts: SetupFacts): RawState {
  return facts.homeOnly ? 'not_applicable' : done(facts.address === 'verified');
}

export const SETUP_ITEMS: readonly SetupItem[] = [
  {
    id: 'network.firewall',
    area: 'network',
    priority: 'required',
    owner: true,
    icon: 'shield',
    title: 'Let phones and cameras reach your home',
    doneText: 'Everything your home needs is open on this network.',
    todoText: 'The firewall on your server blocks phones, cameras or devices.',
    action: 'Open the network setup',
    go: href.setupNetwork(),
    stateOf: firewallState,
  },
  {
    id: 'accounts.linked',
    area: 'accounts',
    priority: 'required',
    owner: true,
    icon: 'link',
    title: 'Add your first devices',
    doneText: 'Your devices are in your home.',
    todoText: 'Connect the account your devices use, or add a device by its address.',
    action: 'Connect an account',
    go: href.settings.page('connections/add'),
    stateOf: (facts) => done(facts.linkedAccounts > 0 || facts.devices > 0),
  },
  {
    id: 'home.named',
    area: 'home',
    priority: 'recommended',
    owner: true,
    icon: 'home',
    title: 'Name your home',
    doneText: 'Your home has its own name.',
    todoText: 'Give your home a name instead of the default.',
    action: 'Name your home',
    go: href.settings.page('home'),
    stateOf: (facts) => done(facts.homeNamed),
  },
  {
    id: 'people.owner_named',
    area: 'people',
    priority: 'recommended',
    owner: true,
    icon: 'user',
    title: 'Say who you are',
    doneText: 'Your profile has your name.',
    todoText: 'Your profile is still called Me. Add your name.',
    action: 'Open profiles',
    go: href.settings.page('profiles'),
    stateOf: (facts) => done(facts.ownerNamed),
  },
  {
    id: 'network.remote',
    area: 'network',
    priority: 'recommended',
    owner: true,
    icon: 'globe',
    title: 'Reach your home when you are away',
    doneText: 'Your public address answers.',
    todoText: 'Set an address that works from outside so phones and assistants can reach you.',
    action: 'Open the network setup',
    go: href.setupNetwork(),
    stateOf: remoteState,
  },
  {
    id: 'network.push',
    area: 'network',
    priority: 'recommended',
    owner: true,
    icon: 'bell',
    title: 'Get alerts when the app is closed',
    doneText: 'A push service is set.',
    todoText:
      'Add your own Firebase key so doorbell, call and alarm alerts arrive when the app is closed.',
    action: 'Set up alerts',
    go: href.settings.page('notifications/push-service'),
    stateOf: (facts) => done(facts.pushConfigured),
  },
  {
    id: 'people.phone_paired',
    area: 'people',
    priority: 'recommended',
    owner: true,
    icon: 'smartphone',
    title: 'Pair a phone',
    doneText: 'A phone is paired.',
    todoText: 'Show a pairing code and scan it on the phone you carry.',
    action: 'Pair a phone',
    go: href.pairPhone(),
    stateOf: (facts) => done(facts.phonePaired),
  },
  {
    id: 'accounts.rooms',
    area: 'accounts',
    priority: 'recommended',
    owner: true,
    icon: 'grid',
    title: 'Put devices in rooms',
    doneText: 'Every device is in a room.',
    todoText: 'Some devices are not in a room yet.',
    action: 'Open rooms',
    go: href.settings.page('home/rooms'),
    stateOf: (facts) => (facts.devices === 0 ? 'not_applicable' : done(facts.unroomed === 0)),
  },
  {
    id: 'fitness.about',
    area: 'fitness',
    priority: 'recommended',
    owner: false,
    icon: 'fitness',
    title: 'Finish setting up Fitness',
    doneText: 'Your height, birthday and sex are set.',
    todoText:
      'Your height, birthday and sex make body composition, calories and heart-rate zones right.',
    action: 'Set up Fitness',
    go: href.fitnessSetup(),
    stateOf: (facts) => (facts.fitnessReady === null ? 'not_applicable' : done(facts.fitnessReady)),
  },
  {
    id: 'home.location',
    area: 'home',
    priority: 'optional',
    owner: true,
    icon: 'mapPin',
    title: 'Add where you live',
    doneText: 'Sunrise, weather and travel time use your location.',
    todoText: 'Add where you live for sunrise, weather and travel time.',
    action: 'Add a location',
    go: href.settings.page('home/location'),
    stateOf: (facts) => done(facts.located),
  },
  {
    id: 'people.second',
    area: 'people',
    priority: 'optional',
    owner: true,
    icon: 'users',
    title: 'Add the people you live with',
    doneText: 'More than one person is in your home.',
    todoText: 'Give everyone their own profile, chats and fitness.',
    action: 'Open profiles',
    go: href.settings.page('profiles'),
    stateOf: (facts) => done(facts.people > 1),
  },
  {
    id: 'assistants.connected',
    area: 'assistants',
    priority: 'optional',
    owner: true,
    icon: 'sparkles',
    title: 'Connect an AI assistant',
    doneText: 'An assistant can use your home.',
    todoText: 'Let an outside assistant see and control your home.',
    action: 'Open integrations',
    go: href.settings.page('assistant/integrations'),
    stateOf: (facts) => done(facts.assistants > 0),
  },
];
