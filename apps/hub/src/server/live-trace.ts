import { traceSubjectOf, type AutomationAuthor, type ClientRow } from '@smarteverything/domain';

export interface TraceOwners {
  readonly authorOf: (automationId: string) => Promise<AutomationAuthor | null>;
  readonly automationOfRun: (runId: string) => Promise<string | null>;
}

export interface TraceProfiles {
  readonly activeProfileOf: (clientId: string) => Promise<string>;
}

async function traceVisible(
  client: ClientRow,
  author: AutomationAuthor | null,
  profiles: TraceProfiles,
): Promise<boolean> {
  return (
    client.role === 'owner' ||
    (author !== null && author.profile_id === (await profiles.activeProfileOf(client.id)))
  );
}

export async function traceAllowed(
  client: ClientRow,
  subject: string,
  owners: TraceOwners,
  profiles: TraceProfiles,
): Promise<boolean> {
  const parsed = traceSubjectOf(subject);
  if (parsed === null) return false;
  if (client.role === 'owner') return true;
  const automationId = parsed.kind === 'run' ? await owners.automationOfRun(parsed.id) : parsed.id;
  return (
    automationId !== null &&
    (await traceVisible(client, await owners.authorOf(automationId), profiles))
  );
}
