import { PLUGIN_MANIFEST } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discordVoiceOf } from '../../src/computers/discord-voice';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;

function install(id: string): void {
  const manifest = PLUGIN_MANIFEST.parse({
    id,
    name: id,
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    icon: 'plug',
  });
  test.store.plugins.create({ manifest, source: 'local', location: null, trusted: true });
}

beforeEach(async () => {
  test = await testStore();
  install('discord');
  install('other');
});

afterEach(async () => {
  await test.close();
});

function call(key: string, pluginId = 'discord'): string {
  return test.store.transcripts.open({
    source: 'plugin',
    sourceId: key,
    pluginId,
    title: 'Discord call · #general',
    retentionDays: null,
    startedAt: new Date().toISOString(),
  }).id;
}

describe('the Discord bot in a voice channel', () => {
  it('is in a voice channel while a Discord call transcript is open', () => {
    const voice = discordVoiceOf(test.store);
    const stop = voice.start();
    const changes: boolean[] = [];
    voice.changes(() => changes.push(voice.inVoice()));
    expect(voice.inVoice()).toBe(false);
    const id = call('discord:111111111111111111:222222222222222222:1700000000000');
    expect(voice.inVoice()).toBe(true);
    test.store.transcripts.close(id, new Date().toISOString());
    expect(voice.inVoice()).toBe(false);
    expect(changes).toEqual([true, false]);
    stop();
  });

  it('ignores other plugins and other kinds of Discord transcripts', () => {
    const voice = discordVoiceOf(test.store);
    const stop = voice.start();
    call('discord:111111111111111111:222222222222222222:1700000000000', 'other');
    call('discord:channel-log');
    expect(voice.inVoice()).toBe(false);
    stop();
  });
});
