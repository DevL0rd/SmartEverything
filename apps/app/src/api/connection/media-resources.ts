import {
  nativeHubResourceIdentity,
  type NativeHubResource,
  type NativeHubResourceOpen,
  type NativeHubResourcePurpose,
  type NativeHubNetwork,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { hubNetwork } from './route-platform';
import { assertHubLease, type HubRouteLease } from './active-route';

const log = new Logger('app.media-resource');
interface Presentation {
  readonly id: string;
  readonly identity: string;
  readonly expiresAt: number;
  readonly isCurrent: () => boolean;
}
interface PresentationTask {
  readonly pending: boolean;
  readonly url: string;
  readonly authorizationExpiresAt: string;
  readonly expiresAt: number;
  readonly isCurrent: () => boolean;
  readonly task: Promise<NativeHubResource>;
}
const presentations = new Map<string, Presentation>();
const tasks = new Map<string, PresentationTask>();
class NativeMediaPresentationError extends Error {
  override readonly name = 'NativeMediaPresentationError';
}
const GRANT_PATH = /^\/resource\/[0-9a-f]{64}$/;

function pendingRenewal(identity: string): PresentationTask | undefined {
  const renewal = tasks.get(identity);
  return renewal !== undefined &&
    renewal.pending &&
    renewal.expiresAt > Date.now() &&
    renewal.isCurrent()
    ? renewal
    : undefined;
}

async function currentPresentation(url: string): Promise<Presentation | undefined> {
  const current = presentations.get(url);
  if (current === undefined || current.expiresAt > Date.now()) return current;
  const renewal = pendingRenewal(current.identity);
  if (renewal === undefined) return current;
  await renewal.task;
  return presentations.get(url);
}

function livePresentation(value: Presentation): boolean {
  return (
    value.isCurrent() &&
    (value.expiresAt > Date.now() || pendingRenewal(value.identity) !== undefined)
  );
}

async function retirePresentations(network: NativeHubNetwork): Promise<void> {
  for (const [key, value] of tasks)
    if (value.expiresAt <= Date.now() || !value.isCurrent()) tasks.delete(key);
  const retired: string[] = [];
  for (const [key, value] of presentations) {
    if (livePresentation(value)) continue;
    presentations.delete(key);
    retired.push(value.id);
  }
  const release = network.releaseResource?.bind(network);
  if (release === undefined)
    throw new NativeMediaPresentationError('Native media requires resource release support.');
  const results = await Promise.allSettled(retired.map((id) => release(id)));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) log.warn('resource.retirement_failed', { count: failed });
}

async function issuePresentation(
  network: NativeHubNetwork,
  lease: HubRouteLease,
  input: NativeHubResourceOpen,
  identity: string,
): Promise<NativeHubResource> {
  const open = network.openResource?.bind(network);
  const release = network.releaseResource?.bind(network);
  if (open === undefined || release === undefined)
    throw new NativeMediaPresentationError(
      'Native media capability requires resource issuance and release.',
    );
  const resource = await open(input);
  const current = presentations.get(resource.localUrl);
  if (!lease.isCurrent()) {
    if (current === undefined) await release(resource.id);
    else rememberPresentation(resource, identity, current.isCurrent);
    assertHubLease(lease, 'GET');
  }
  rememberPresentation(resource, identity, lease.isCurrent);
  return resource;
}

function rememberPresentation(
  resource: NativeHubResource,
  identity: string,
  isCurrent: () => boolean,
): void {
  const current = presentations.get(resource.localUrl);
  const expiresAt = Date.parse(resource.expiresAt);
  if (current === undefined || current.expiresAt <= expiresAt)
    presentations.set(resource.localUrl, { id: resource.id, identity, expiresAt, isCurrent });
}

async function resourcePresentation(
  network: NativeHubNetwork,
  lease: HubRouteLease,
  input: NativeHubResourceOpen,
): Promise<string> {
  const identity = nativeHubResourceIdentity(input);
  const existing = tasks.get(identity);
  if (
    existing?.url === input.url &&
    existing.authorizationExpiresAt === input.expiresAt &&
    existing.isCurrent()
  )
    return (await existing.task).localUrl;
  const task = issuePresentation(network, lease, input, identity);
  tasks.set(identity, {
    pending: true,
    url: input.url,
    authorizationExpiresAt: input.expiresAt,
    expiresAt: Date.parse(input.expiresAt),
    isCurrent: lease.isCurrent,
    task,
  });
  try {
    const resource = await task;
    const current = tasks.get(identity);
    if (current?.task === task) tasks.set(identity, { ...current, pending: false });
    return resource.localUrl;
  } catch (cause) {
    if (tasks.get(identity)?.task === task) tasks.delete(identity);
    throw cause;
  }
}

export async function presentMediaResource(
  lease: HubRouteLease | undefined,
  url: string,
  expiresAt: string,
  purpose: NativeHubResourcePurpose,
): Promise<string> {
  const network = hubNetwork();
  if (lease?.nativeAuthority !== true || network.capabilities.httpMedia !== true) return url;
  const binding = lease.binding;
  const routeGeneration = lease.nativeRouteGeneration;
  if (binding === undefined || routeGeneration === undefined)
    throw new NativeMediaPresentationError(
      'Native media requires an independently bound route lease.',
    );
  assertHubLease(lease, 'GET');
  if (Date.parse(expiresAt) <= Date.now())
    throw new NativeMediaPresentationError('Native media authorization has expired.');
  await retirePresentations(network);
  assertHubLease(lease, 'GET');
  const signed = new URL(url);
  return resourcePresentation(network, lease, {
    scopeId: lease.scopeId,
    binding,
    routeGeneration,
    url: `${binding.canonicalOrigin}${signed.pathname}${signed.search}`,
    expiresAt,
    purpose,
  });
}

export async function nativeMediaFile(
  url: string,
  intent: 'open' | 'save',
): Promise<'external' | 'completed' | 'cancelled'> {
  const resource = await currentPresentation(url);
  const network = hubNetwork();
  if (resource !== undefined) {
    if (!resource.isCurrent() || resource.expiresAt <= Date.now())
      throw new NativeMediaPresentationError(
        'This native media grant has expired or its route changed.',
      );
    if (network.downloadResource === undefined || network.capabilities.download !== true)
      throw new NativeMediaPresentationError(
        'This native media transport cannot open or save files.',
      );
    return network.downloadResource({ id: resource.id, intent });
  }
  if (
    URL.canParse(url) &&
    new URL(url).hostname === '127.0.0.1' &&
    GRANT_PATH.test(new URL(url).pathname)
  )
    throw new NativeMediaPresentationError('This native media grant is no longer available.');
  return 'external';
}
