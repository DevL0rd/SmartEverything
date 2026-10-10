import type { ClientRow, Role } from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';

export interface ClientView {
  readonly client: ClientRow;
  readonly you: boolean;
  readonly removable: boolean;
  readonly detail: string;
}

export const ROLE_LABEL: Readonly<Record<Role, string>> = { owner: 'Owner', member: 'Member' };

export const ROLE_HELP: Readonly<Record<Role, string>> = {
  member: 'Can use devices, cameras and automations',
  owner: 'Can also change settings and pair others',
};

const PLATFORM_LABEL: Readonly<Record<ClientRow['platform'], string>> = {
  desktop: 'Desktop app',
  android: 'Android',
  web: 'Browser',
};

function seenText(client: ClientRow, you: boolean, now: number): string {
  if (you) {
    return 'This device';
  }
  return client.last_seen_at === null
    ? 'Never connected'
    : `Seen ${relative(client.last_seen_at, now)}`;
}

export function clientViews(
  clients: readonly ClientRow[],
  me: string,
  now: number,
): readonly ClientView[] {
  return [...clients]
    .sort(
      (left, right) =>
        Number(right.id === me) - Number(left.id === me) ||
        Number(right.built_in) - Number(left.built_in) ||
        left.created_at.localeCompare(right.created_at),
    )
    .map((client) => {
      const you = client.id === me;
      return {
        client,
        you,
        removable: !client.built_in && !you,
        detail: joinParts([
          PLATFORM_LABEL[client.platform],
          ROLE_LABEL[client.role],
          seenText(client, you, now),
        ]),
      };
    });
}

export function newlyPaired(
  clients: readonly ClientRow[],
  known: ReadonlySet<string>,
): ClientRow | null {
  return clients.find((client) => !known.has(client.id)) ?? null;
}

export function platformIcon(platform: ClientRow['platform']): 'smartphone' | 'monitor' | 'globe' {
  switch (platform) {
    case 'android':
      return 'smartphone';
    case 'desktop':
      return 'monitor';
    case 'web':
      return 'globe';
  }
}
