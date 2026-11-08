import type { DriveRecentEntry, DriveVia } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

export interface RecentHow {
  readonly text: string;
  readonly colour: ColourRole;
}

export interface RecentNames {
  readonly me: string | null;
  readonly personOf: (profileId: string) => string | null;
  readonly deviceOf: (deviceId: string) => string | null;
}

type Written = Exclude<DriveRecentEntry, { readonly kind: 'opened' }>;

const OPENED: RecentHow = { text: 'Opened', colour: 'viz-blue' };

const UNKNOWN_DEVICE = 'a computer';

function verbOf(entry: Written): string {
  return entry.kind === 'added' ? 'Added' : 'Changed';
}

function deviceName(entry: Written, names: RecentNames): string {
  return entry.deviceId === null
    ? UNKNOWN_DEVICE
    : (names.deviceOf(entry.deviceId) ?? UNKNOWN_DEVICE);
}

function personColour(actor: string | null, names: RecentNames): ColourRole {
  return actor !== null && actor === names.me ? 'viz-blue' : 'viz-magenta';
}

function byPerson(verb: string, entry: Written, names: RecentNames): RecentHow {
  const actor = entry.actorProfileId;
  if (actor === null) return { text: `${verb} in the app`, colour: personColour(actor, names) };
  if (actor === names.me) return { text: `${verb} by you`, colour: personColour(actor, names) };
  const name = names.personOf(actor);
  return {
    text: name === null ? `${verb} by someone` : `${verb} by ${name}`,
    colour: 'viz-magenta',
  };
}

type ViaHow = (verb: string, entry: Written, names: RecentNames) => RecentHow;

const VIA_HOW: Readonly<Record<DriveVia, ViaHow>> = {
  app: byPerson,
  ai: (verb) => ({ text: `${verb} by AI`, colour: 'viz-violet' }),
  automation: (verb) => ({ text: `${verb} by an automation`, colour: 'viz-green' }),
  mount: (verb, entry, names) => ({
    text: `${verb} in the drive on ${deviceName(entry, names)}`,
    colour: 'track',
  }),
  sync: (verb, entry, names) => ({
    text: `${verb} on ${deviceName(entry, names)} and synced`,
    colour: 'track',
  }),
  scan: (verb) => ({ text: `${verb}, found in a scan`, colour: 'track' }),
  share: (verb, entry, names) => ({
    text: `${verb} through a share link`,
    colour: personColour(entry.actorProfileId, names),
  }),
  outside: (verb) => ({ text: `${verb} outside SmartEverything`, colour: 'primary' }),
};

export function howOf(entry: DriveRecentEntry, names: RecentNames): RecentHow {
  if (entry.kind === 'opened') return OPENED;
  return VIA_HOW[entry.via](verbOf(entry), entry, names);
}
