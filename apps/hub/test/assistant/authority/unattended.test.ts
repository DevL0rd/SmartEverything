import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { DATABASE_FILE } from '../../../src/service/configuration';
import { openStore, type Store } from '../../../src/store/store';
import { clientOf } from '../../automations/support/client';
import { bootServer, linkFakeProvider, pairPhone, verifiedPublicUrl } from '../../support/booted';
import { legacyAutomation } from '../../support/legacy-automation';
import { captureLogs, testLogger } from '../../support/logs';
import { temporaryDirectory } from '../../support/server';

const HEAVY_MS = 30_000;

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
});

afterEach(async () => {
  await directory.remove();
});

function whileStopped<T>(work: (store: Store) => T): T {
  const store = openStore({
    path: join(directory.path, DATABASE_FILE),
    log: testLogger('store'),
    now: () => new Date('2026-10-08T10:00:00.000Z'),
    systemTimeZone: 'UTC',
  });
  try {
    return work(store);
  } finally {
    store.close();
  }
}

interface Saved {
  readonly lamp: string;
  readonly automation: string;
  readonly profile: string;
  readonly phone: string;
}

async function saveFromPhone(options: { readonly removePhone: boolean }): Promise<Saved> {
  const booted = await bootServer(directory.path);
  await linkFakeProvider(booted);
  const owner = clientOf(booted.base, booted.owner);
  const lamp = (await owner.request(API_ENDPOINTS.listDevices)).find(
    (device) => device.external_id === 'lamp-1',
  );
  const snapshot = await owner.request(API_ENDPOINTS.readSnapshot);
  const profile = snapshot.tables.profiles[0];
  if (lamp === undefined || profile === undefined) throw new Error('The home was not seeded.');
  await verifiedPublicUrl(booted);
  const phone = await pairPhone(booted, 'owner');
  const automation = await owner.request(API_ENDPOINTS.createAutomation, {
    body: {
      name: 'Occupied',
      enabled: true,
      definition: legacyAutomation({
        triggers: [{ type: 'interval', everyMinutes: 10_080 }],
        conditions: { mode: 'all', items: [] },
        actions: [{ type: 'command', deviceId: lamp.id, capability: 'power', value: true }],
      }),
    },
  });
  if (options.removePhone)
    await owner.request(API_ENDPOINTS.removeClient, { params: { clientId: phone.clientId } });
  await booted.server.stop();
  return { lamp: lamp.id, automation: automation.id, profile: profile.id, phone: phone.clientId };
}

function authorityOf(saved: Saved): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: saved.profile,
    client_id: saved.phone,
    kind: 'client',
    role: 'owner',
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

async function runSaved(saved: Saved): Promise<readonly string[]> {
  const booted = await bootServer(directory.path);
  const owner = clientOf(booted.base, booted.owner);
  try {
    await owner.request(API_ENDPOINTS.runAutomation, {
      params: { automationId: saved.automation },
    });
    return booted.fake.adapter.executed.map(
      (command) => `${command.externalId}:${command.capability}:${JSON.stringify(command.value)}`,
    );
  } finally {
    await booted.server.stop();
  }
}

describe('AI-created automations run with the profile that saved them', () => {
  it(
    'runs after the phone that created it was unpaired',
    async () => {
      const saved = await saveFromPhone({ removePhone: true });
      whileStopped((store) => {
        const authority = authorityOf(saved);
        store.harnessRecovery.authorize(authority);
        store.harnessRecovery.effects.keep('automation', saved.automation, authority);
      });
      expect(await runSaved(saved)).toStrictEqual(['lamp-1:power:true']);
    },
    HEAVY_MS,
  );

  it(
    'runs when the saving profile has no permission record any more',
    async () => {
      const saved = await saveFromPhone({ removePhone: false });
      whileStopped((store) => {
        store.harnessRecovery.effects.keep('automation', saved.automation, authorityOf(saved));
      });
      expect(await runSaved(saved)).toStrictEqual(['lamp-1:power:true']);
    },
    HEAVY_MS,
  );

  it(
    'runs after the phone moved to another profile',
    async () => {
      const saved = await saveFromPhone({ removePhone: false });
      whileStopped((store) => {
        const authority = authorityOf(saved);
        store.harnessRecovery.authorize(authority);
        store.harnessRecovery.effects.keep('automation', saved.automation, authority);
        const other = store.profiles.create({ name: 'Guest' });
        store.clients.useProfile(saved.phone, other.id);
      });
      expect(await runSaved(saved)).toStrictEqual(['lamp-1:power:true']);
    },
    HEAVY_MS,
  );
});
