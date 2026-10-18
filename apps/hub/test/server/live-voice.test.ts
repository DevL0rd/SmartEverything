import type { ClientRow, LiveMessage } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VoiceWatcher } from '../../src/listening/voice-activity';
import { LiveVoice, type VoiceLevelSource } from '../../src/server/live-voice';
import { captureLogs, testLogger } from '../support/logs';

const CLIENT: ClientRow = {
  id: 'client-1',
  name: 'Desktop',
  platform: 'desktop',
  role: 'owner',
  built_in: false,
  profile_id: null,
  created_at: '2026-10-17T10:00:00.000Z',
  last_seen_at: null,
};

const CONNECTION = { id: 7, client: CLIENT };

function rig(allowed: boolean): {
  readonly voice: LiveVoice<typeof CONNECTION>;
  readonly watchers: VoiceWatcher[];
  readonly sent: LiveMessage[];
  readonly events: () => string[];
} {
  const logs = captureLogs();
  const watchers: VoiceWatcher[] = [];
  const sent: LiveMessage[] = [];
  const source: VoiceLevelSource = {
    watch: (watcher): boolean => {
      watchers.push(watcher);
      return allowed;
    },
    active: (): [] => [],
    release: (): void => undefined,
  };
  const voice = new LiveVoice<typeof CONNECTION>({
    send: (_connection, message): void => {
      sent.push(message);
    },
    profileOf: (): string => 'profile-1',
    log: testLogger('live-voice'),
  });
  voice.attach(source);
  return { voice, watchers, sent, events: logs.events };
}

describe('live voice watching', () => {
  it('logs a refused watch with the call and the connection instead of staying silent', () => {
    const { voice, events } = rig(false);
    expect(voice.watch(CONNECTION, 'call-1')).toBe(false);
    expect(events()).toEqual(['voice_watch.refused']);
  });

  it('stays quiet about an accepted watch', () => {
    const { voice, events } = rig(true);
    expect(voice.watch(CONNECTION, 'call-1')).toBe(true);
    expect(events()).toEqual([]);
  });

  it('refuses every watch while no level source is attached', () => {
    const logs = captureLogs();
    const voice = new LiveVoice<typeof CONNECTION>({
      send: (): void => undefined,
      profileOf: (): string => 'profile-1',
      log: testLogger('live-voice'),
    });
    expect(voice.watch(CONNECTION, 'call-1')).toBe(false);
    expect(logs.events()).toEqual(['voice_watch.refused']);
  });

  it('hands the watcher the connection, its role and its profile and sends notices to that connection', () => {
    const { voice, watchers, sent } = rig(true);
    voice.watch(CONNECTION, 'call-1');
    const [watcher] = watchers;
    expect(watcher?.key).toBe('7');
    expect(watcher?.owner).toBe(true);
    expect(watcher?.profileId).toBe('profile-1');
    watcher?.send({ type: 'voice_levels', call_id: 'call-1', in: 3, out: 0 });
    expect(sent).toEqual([{ type: 'voice_levels', call_id: 'call-1', in: 3, out: 0 }]);
  });
});
