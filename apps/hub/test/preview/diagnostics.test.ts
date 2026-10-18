import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreviewConsoleRecord, PreviewDiagnosticScope } from '@smarteverything/domain';
import type { Caller } from '../../src/server/auth';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { PreviewDiagnosticAuthority } from '../../src/preview/diagnostic-authority';
import { PreviewDiagnostics } from '../../src/preview/diagnostics';
import { ViewerFocus } from '../../src/preview/viewer-focus';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import type { HtmlPublication } from '../../src/preview/documents';
import { htmlPublication } from './support';

let rig: Rig;
let diagnostics: PreviewDiagnostics;
let published: ReturnType<typeof htmlPublication>;
const wakes: string[] = [];
let admit: (event: StoredEvent) => boolean;

beforeEach(async () => {
  rig = await harnessRig();
  wakes.length = 0;
  const { store } = rig.opened;
  const chat = rig.newChat({ kind: 'server' });
  published = htmlPublication(rig, chat.id);
  const authority = new PreviewDiagnosticAuthority(store, {
    require: (id): HtmlPublication => {
      if (id !== published.view.id) throw new Error('unknown publication');
      return published;
    },
  });
  diagnostics = new PreviewDiagnostics(
    store,
    authority,
    {
      admitDelivery: (listener): (() => void) => {
        admit = listener;
        return () => undefined;
      },
      files: {
        keepBytes: (): Promise<never> => Promise.reject(new Error('This test captures nothing.')),
        remove: (): Promise<void> => Promise.resolve(),
      },
      previewError: (id, scope, text): void => {
        wakes.push(id);
        store.assistantEvents.add({
          id,
          kind: 'wake',
          chat_id: scope.chatId,
          message_id: null,
          profile_id: scope.profileId,
          client_id: scope.clientId,
          text,
        });
      },
    },
    new ViewerFocus(),
  );
});

afterEach(async () => {
  diagnostics.stop();
  await rig.close();
});

function scope(
  documentId: string,
  revision: string | null,
  viewerId = randomUUID(),
): PreviewDiagnosticScope {
  const chatId = published.view.chat_id;
  const result: PreviewDiagnosticScope = {
    clientId: rig.clientId,
    profileId: rig.owner.profileId,
    chatId,
    viewerId,
    browserId: documentId,
    documentId,
    revision,
    epoch: randomUUID(),
  };
  return result;
}

function error(id: number): PreviewConsoleRecord {
  return {
    id,
    time: '2026-10-17T10:00:00.000Z',
    level: 'error',
    message: 'boom',
    source: null,
    stack: null,
    truncatedBytes: 0,
  };
}

const connection = {
  capture: (): Promise<null> => Promise.resolve(null),
  close: (): void => undefined,
};

function report(
  value: PreviewDiagnosticScope,
  visible = true,
): ReturnType<PreviewDiagnostics['write']> {
  return diagnostics.write({ scope: value, visible, records: [error(1)] }, connection);
}

describe('console errors wake the AI only for pages it shared', () => {
  it('never wakes for a public website', () => {
    const id = `public:${randomUUID()}`;
    expect(report(scope(id, null)).delivery).toBe('none');
    expect(wakes).toEqual([]);
  });

  it('wakes once for an AI page and again only for its next revision', () => {
    const first = scope(published.view.id, published.view.revision);
    expect(report(first).delivery).toBe('shared');
    report({ ...first, epoch: randomUUID() });
    report(scope(published.view.id, published.view.revision));
    expect(wakes).toEqual([published.view.revision]);
    const next = randomUUID();
    published = { ...published, view: { ...published.view, revision: next } };
    report(scope(published.view.id, next));
    expect(wakes).toEqual([wakes[0], next]);
  });

  it('wakes for a saved chat page that carries no revision in its scope', () => {
    report(scope(published.view.id, null));
    expect(wakes).toEqual([published.view.revision]);
  });

  it('does not wake for a viewer that is not visible', () => {
    report(scope(published.view.id, published.view.revision), false);
    expect(wakes).toEqual([]);
  });

  it('keeps a pending wake on its visible viewer when a hidden one writes', () => {
    report(scope(published.view.id, published.view.revision));
    report(scope(published.view.id, published.view.revision), false);
    const event = rig.opened.store.assistantEvents.find(published.view.revision);
    expect(event).toBeDefined();
    if (event !== undefined) expect(admit(event)).toBe(true);
  });
});

describe('the AI reads the most recently focused viewer', () => {
  function caller(): Caller {
    return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
  }
  function read(): readonly number[] {
    return diagnostics
      .read(caller(), published.view.chat_id, { direction: 'before', limit: 10, byteLimit: 65536 })
      .records.map((record) => record.id);
  }

  it('picks the viewer that became visible last, on any device', () => {
    const left = scope(published.view.id, published.view.revision);
    const right = scope(published.view.id, published.view.revision);
    const record = (id: number): PreviewConsoleRecord => ({ ...error(id), level: 'info' });
    diagnostics.write({ scope: left, visible: true, records: [record(1)] }, connection);
    diagnostics.write({ scope: right, visible: true, records: [record(2)] }, connection);
    expect(read()).toEqual([2]);
    diagnostics.write({ scope: left, visible: false, records: [] }, connection);
    diagnostics.write({ scope: left, visible: true, records: [] }, connection);
    expect(read()).toEqual([1]);
  });

  it('says plainly when no viewer is open', () => {
    expect(() => read()).toThrow('No matching preview is open');
  });

  it('lets a reconnecting viewer replace its earlier socket and keeps its records', () => {
    const value = scope(published.view.id, published.view.revision);
    const closed: string[] = [];
    const socket = (name: string): typeof connection => ({
      capture: connection.capture,
      close: (): void => {
        closed.push(name);
      },
    });
    const record = { ...error(1), level: 'info' as const };
    diagnostics.write({ scope: value, visible: true, records: [record] }, socket('old'));
    diagnostics.write({ scope: value, visible: true, records: [] }, socket('new'));
    expect(closed).toEqual(['old']);
    expect(read()).toEqual([1]);
  });
});

describe('capturing the viewport', () => {
  function caller(): Caller {
    return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
  }

  it('explains how to show a pane that is not on screen', async () => {
    diagnostics.write(
      { scope: scope(published.view.id, published.view.revision), visible: false, records: [] },
      connection,
    );
    await expect(diagnostics.capture(caller(), published.view.chat_id, {})).rejects.toThrow(
      'The browser pane is not on screen',
    );
  });

  it('clears website data of a pane that is not on screen', async () => {
    const actions: string[] = [];
    diagnostics.write(
      { scope: scope(published.view.id, published.view.revision), visible: false, records: [] },
      {
        capture: (request): Promise<null> => {
          actions.push(request.action);
          return Promise.resolve(null);
        },
        close: (): void => undefined,
      },
    );
    await expect(
      diagnostics.clear(caller(), published.view.chat_id, { action: 'clear-cookies' }),
    ).resolves.toEqual({ ok: true });
    expect(actions).toEqual(['clear-cookies']);
  });

  it('captures the current viewer once when the page reloads mid-capture', async () => {
    const value = scope(published.view.id, published.view.revision);
    const calls: string[] = [];
    const replacement = {
      capture: (): Promise<null> => {
        calls.push('new');
        return Promise.resolve(null);
      },
      close: (): void => undefined,
    };
    const original = {
      capture: (): Promise<null> => {
        calls.push('old');
        diagnostics.write({ scope: value, visible: true, records: [] }, replacement);
        return Promise.resolve(null);
      },
      close: (): void => undefined,
    };
    diagnostics.write({ scope: value, visible: true, records: [] }, original);
    await expect(diagnostics.capture(caller(), published.view.chat_id, {})).rejects.toThrow(
      'The viewing device did not return image pixels.',
    );
    expect(calls).toEqual(['old', 'new']);
  });
});

describe('ignoring a recurring unavoidable error', () => {
  function caller(): Caller {
    return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
  }
  const chat = (): string => published.view.chat_id;
  const page = (): PreviewDiagnosticScope => scope(published.view.id, published.view.revision);
  function beacon(id: number, line: number, query: string): PreviewConsoleRecord {
    return {
      ...error(id),
      message: `Refused to load https://static.cloudflareinsights.com/beacon.min.js?token=${query} because it violates the CSP`,
      source: `https://example.test/app.js:${String(line)}`,
      stack: `at start (https://example.test/app.js:${String(line)}:${String(line + 4)})`,
    };
  }
  function nextRevision(): void {
    published = { ...published, view: { ...published.view, revision: randomUUID() } };
  }
  function send(
    value: PreviewDiagnosticScope,
    records: PreviewConsoleRecord[],
    visible = true,
  ): void {
    diagnostics.write({ scope: value, visible, records }, connection);
  }
  function ignore(value: PreviewDiagnosticScope, recordId: number): void {
    diagnostics.ignoreError(caller(), chat(), { viewerId: value.viewerId, recordId, reason: 'x' });
  }

  it('keeps matching the same cause when the stack line or the query changes', () => {
    const first = page();
    send(first, [beacon(1, 10, 'a')]);
    ignore(first, 1);
    wakes.length = 0;
    nextRevision();
    const next = page();
    send(next, [beacon(1, 99, 'b')]);
    expect(wakes).toEqual([]);
  });

  it('wakes for a different error even when another one is ignored', () => {
    const value = page();
    send(value, [beacon(1, 10, 'a')]);
    ignore(value, 1);
    wakes.length = 0;
    nextRevision();
    send(page(), [beacon(1, 10, 'a'), { ...error(2), message: 'a real failure' }]);
    expect(wakes).toEqual([published.view.revision]);
  });

  it('keeps every raw record readable while the error is ignored', () => {
    const value = page();
    send(value, [beacon(1, 10, 'a')]);
    ignore(value, 1);
    send(value, [beacon(2, 11, 'a')]);
    const page2 = diagnostics.read(caller(), chat(), {
      direction: 'before',
      limit: 10,
      byteLimit: 65536,
    });
    expect(page2.records.map((record) => record.id)).toEqual([1, 2]);
    expect(page2.errors).toBe(2);
  });

  it('lists the rule with its reason and sample and restores it', () => {
    const value = page();
    send(value, [beacon(1, 10, 'a')]);
    ignore(value, 1);
    const [rule] = diagnostics.readErrorRules(caller(), chat());
    expect(rule?.reason).toBe('x');
    expect(rule?.sample).toContain('cloudflareinsights');
    expect(rule?.scopeKey).toBe(`page:${published.view.id}`);
    if (rule === undefined) throw new Error('expected a rule');
    expect(diagnostics.restoreError(caller(), chat(), rule)).toEqual([]);
    wakes.length = 0;
    nextRevision();
    send(page(), [beacon(1, 10, 'a')]);
    expect(wakes).toEqual([published.view.revision]);
  });

  it('refuses to ignore a warning or an unknown record', () => {
    const value = page();
    send(value, [{ ...error(1), level: 'warning' }]);
    expect(() => {
      ignore(value, 1);
    }).toThrow('Choose a complete error record');
    expect(() => {
      ignore(value, 7);
    }).toThrow('Choose a complete error record');
  });

  it('never wakes for a warning', () => {
    send(page(), [{ ...error(1), level: 'warning' }]);
    expect(wakes).toEqual([]);
  });
});
