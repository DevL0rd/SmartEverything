import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Caller } from '../../src/server/auth';
import type { HtmlPublication } from '../../src/preview/documents';
import { PreviewLeases } from '../../src/preview/leases';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import { htmlPublication } from './support';

let rig: Rig;
let leases: PreviewLeases;
let published: HtmlPublication;
let required = 0;
let revoke: (id: string) => void = () => undefined;

function caller(): Caller {
  return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
}

function codeOf(url: string): string {
  return new URL(url).searchParams.get('code') ?? '';
}

beforeEach(async () => {
  rig = await harnessRig();
  required = 0;
  published = htmlPublication(rig, rig.newChat({ kind: 'server' }).id);
  leases = new PreviewLeases(rig.opened.store, {
    require: (): HtmlPublication => {
      required += 1;
      return published;
    },
    onRevoke: (listener): (() => void) => {
      revoke = listener;
      return (): void => undefined;
    },
  });
});

afterEach(async () => {
  leases.stop();
  vi.useRealTimers();
  await rig.close();
});

describe('a preview lease is authorised once, when it is issued', () => {
  it('lets a slow viewer bootstrap long after thirty seconds', () => {
    vi.useFakeTimers();
    const lease = leases.issueHtml(caller(), published, 'preview.test');
    leases.own(caller(), published.view.chat_id, lease, () => undefined);
    vi.advanceTimersByTime(5 * 60_000);
    expect(() => leases.bootstrap(new URL(lease.origin).host, codeOf(lease.url))).not.toThrow();
  });

  it('keeps a lease until it is released', () => {
    vi.useFakeTimers();
    const lease = leases.issueHtml(caller(), published, 'preview.test');
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(() => leases.host(new URL(lease.origin).host)).not.toThrow();
  });

  it('issues any number of leases', () => {
    for (let index = 0; index < 300; index += 1)
      leases.issueHtml(caller(), published, 'preview.test');
    expect(() => leases.issueHtml(caller(), published, 'preview.test')).not.toThrow();
  });

  it('does not revalidate leases when unrelated home data changes', () => {
    const lease = leases.issueHtml(caller(), published, 'preview.test');
    required = 0;
    rig.opened.store.settings.setPublicUrl('https://home.example/');
    expect(required).toBe(0);
    expect(() => leases.host(new URL(lease.origin).host)).not.toThrow();
  });

  it('ends the lease when its person is no longer the phone profile', () => {
    const lease = leases.issueHtml(caller(), published, 'preview.test');
    const { store } = rig.opened;
    store.clients.useProfile(rig.clientId, store.profiles.create({ name: 'Guest' }).id);
    expect(() => leases.host(new URL(lease.origin).host)).toThrow();
  });

  it('ends the lease when its publication is revoked', () => {
    const lease = leases.issueHtml(caller(), published, 'preview.test');
    revoke(published.view.id);
    expect(() => leases.host(new URL(lease.origin).host)).toThrow('Unknown isolated preview host');
  });
});
