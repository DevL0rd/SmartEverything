import { traceSubjectOf, type AutomationAuthor, type ClientRow } from '@smarteverything/domain';

export interface TraceOwners {
  readonly authorOf: (automationId: string) => AutomationAuthor | null;
  readonly automationOfRun: (runId: string) => string | null;
}

export interface TraceProfiles {
  readonly profiles: { readonly activeOf: (clientId: string) => { readonly id: string } };
}

export function traceVisible(
  client: ClientRow,
  author: AutomationAuthor | null,
  store: TraceProfiles,
): boolean {
  return (
    client.role === 'owner' ||
    (author !== null && author.profile_id === store.profiles.activeOf(client.id).id)
  );
}

export function traceAllowed(
  client: ClientRow,
  subject: string,
  owners: TraceOwners,
  store: TraceProfiles,
): boolean {
  const parsed = traceSubjectOf(subject);
  if (parsed === null) return false;
  if (client.role === 'owner') return true;
  const automationId = parsed.kind === 'run' ? owners.automationOfRun(parsed.id) : parsed.id;
  return automationId !== null && traceVisible(client, owners.authorOf(automationId), store);
}
