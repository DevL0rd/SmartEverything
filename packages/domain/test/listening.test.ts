import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  COMPUTER_FEATURES,
  COMPUTER_FEATURE_LIST,
  EAR_CODEC,
  EAR_SOURCE,
  EAR_SOURCE_KINDS,
  HUB_FRAME,
  LISTENING_CONFIG,
  LISTENING_HUB_MESSAGE,
  LISTENING_NODE_MESSAGE,
  LISTENING_PHONE_STANDARD,
  LISTENING_POWER_MODES,
  LISTENING_POWER_MODE_LABELS,
  LISTENING_RUNTIME_STATES,
  LISTENING_STANDARD,
  LISTENING_STATES,
  LISTENING_STATE_LABELS,
  LISTENING_PHONE_REPORT,
  LISTENING_SOURCE_CHANGE,
  LISTENING_VIEW,
  LIVE_NOTICE,
  NODE_FRAME,
  REMOTE_EAR_HUB_MESSAGE,
  REMOTE_EAR_NODE_MESSAGE,
  SETTINGS_ROW,
  SPEECH_SOURCE,
  SPEECH_SOURCES,
  TRANSCRIPT_SOURCES,
  TRANSCRIPT_SETTINGS,
  TRANSCRIPT_SETTINGS_CHANGE,
  WAKE_ARBITRATED,
  WAKE_CLAIM,
  listeningKeyOf,
  listeningKindOf,
} from '../src';

const AT = '2026-10-17T10:00:00.000Z';
const ID = '4f6c2d9e-2c54-4d38-9e77-5d7e5b0f6a11';

const PCM = Buffer.from([1, 0, 2, 0]).toString('base64');

describe('wake claims and contests', () => {
  it('round-trips a contest with its claims', () => {
    const contest = {
      at: AT,
      winner: { source: 'phone', key: ID, snippetDbfs: -21.5 },
      decidedBy: 'loudest',
      claims: [
        { source: 'camera', key: ID, snippetDbfs: -30, afterMs: 0, outcome: 'superseded' },
        { source: 'phone', key: ID, snippetDbfs: -21.5, afterMs: 340, outcome: 'won' },
      ],
    };
    expect(WAKE_ARBITRATED.parse(contest)).toEqual(contest);
  });

  it('refuses a level above full scale and an unknown source', () => {
    expect(WAKE_CLAIM.safeParse({ source: 'phone', key: ID, snippetDbfs: 3 }).success).toBe(false);
    expect(WAKE_CLAIM.safeParse({ source: 'watch', key: ID, snippetDbfs: -3 }).success).toBe(false);
  });

  it('files a Discord claim under one Discord row and walkie under its channel', () => {
    expect(listeningKeyOf('voice_call', 'guild:user')).toBe('discord');
    expect(listeningKeyOf('talk', ID)).toBe(ID);
    expect(listeningKindOf('talk')).toBe('walkie');
    expect(listeningKindOf('voice_call')).toBe('discord');
    expect(listeningKindOf('computer')).toBe('computer');
  });
});

describe('the listening view', () => {
  const source = {
    key: ID,
    kind: 'phone',
    name: 'Pixel',
    profileId: ID,
    wake: true,
    transcribe: false,
    state: 'listening',
    writing: { state: 'off' },
    sensitivity: 'standard',
    changeable: true,
    claims: [{ at: AT, snippetDbfs: -25, outcome: 'won' }],
  };

  it('round-trips sources with claims and a paused write-down', () => {
    const view = {
      sources: [source, { ...source, writing: { state: 'paused', reason: 'cap_reached' } }],
      last: null,
    };
    expect(LISTENING_VIEW.parse(view)).toEqual(view);
  });

  it('needs a change and refuses unknown fields', () => {
    expect(LISTENING_SOURCE_CHANGE.safeParse({}).success).toBe(false);
    expect(LISTENING_SOURCE_CHANGE.safeParse({ wake: false }).success).toBe(true);
    expect(LISTENING_SOURCE_CHANGE.safeParse({ wake: false, loud: 1 }).success).toBe(false);
  });

  it('carries the power mode of a phone and accepts it as a change', () => {
    const phone = { ...source, power_mode: 'charging' };
    expect(LISTENING_VIEW.parse({ sources: [phone], last: null }).sources[0]?.power_mode).toBe(
      'charging',
    );
    expect(LISTENING_VIEW.safeParse({ sources: [source], last: null }).success).toBe(true);
    expect(LISTENING_SOURCE_CHANGE.safeParse({ power_mode: 'away_from_home' }).success).toBe(true);
    expect(LISTENING_SOURCE_CHANGE.safeParse({ power_mode: 'sometimes' }).success).toBe(false);
  });

  it('labels every power mode and starts phones with the wake listener off', () => {
    expect(Object.keys(LISTENING_POWER_MODE_LABELS)).toEqual([...LISTENING_POWER_MODES]);
    expect(LISTENING_PHONE_STANDARD).toEqual({ wake: false, transcribe: false });
    expect(LISTENING_STANDARD.wake).toBe(true);
  });

  it('puts the power mode in the phone config and leaves it out for computers', () => {
    const config = {
      wake: true,
      transcribe: false,
      keywords: ['▁HE Y @hey'],
      threshold: 0.25,
      nearMissThreshold: 0.1,
      sensitivity: 'standard',
      pause_ms: 640,
      power_mode: 'screen_on',
    };
    expect(LISTENING_CONFIG.parse(config)).toEqual(config);
    const { power_mode: omitted, ...computer } = config;
    expect(omitted).toBe('screen_on');
    expect(LISTENING_CONFIG.parse(computer)).toEqual(computer);
    expect(LISTENING_CONFIG.safeParse({ ...config, power_mode: 'never' }).success).toBe(false);
  });

  it('carries one of the end-of-speech pauses and refuses any other', () => {
    const config = {
      wake: true,
      transcribe: true,
      keywords: [],
      threshold: 0.25,
      nearMissThreshold: 0.1,
      sensitivity: 'standard',
    };
    expect(LISTENING_CONFIG.safeParse({ ...config, pause_ms: 1000 }).success).toBe(true);
    expect(LISTENING_CONFIG.safeParse({ ...config, pause_ms: 999 }).success).toBe(false);
    expect(LISTENING_CONFIG.safeParse(config).success).toBe(false);
  });

  it('serves the three endpoints to members', () => {
    expect(API_ENDPOINTS.readListening.access).toBe('member');
    expect(API_ENDPOINTS.updateListeningSource.path).toBe('/api/listening/sources/:sourceKey');
    expect(API_ENDPOINTS.watchListeningLevel.method).toBe('PUT');
  });
});

describe('notices and node messages', () => {
  it('knows the change and level notices', () => {
    expect(LIVE_NOTICE.safeParse({ type: 'listening_changed' }).success).toBe(true);
    expect(
      LIVE_NOTICE.safeParse({ type: 'listening_level', sourceKey: ID, dbfs: -40 }).success,
    ).toBe(true);
  });

  it('knows the wake test notice and refuses an unknown verdict', () => {
    const line = {
      id: ID,
      at: '2026-10-18T10:00:00.000Z',
      source: 'Kitchen',
      verdict: 'almost',
      text: 'hey jarvis',
      phrase: null,
    };
    expect(LIVE_NOTICE.safeParse({ type: 'wake_test_heard', line }).success).toBe(true);
    expect(
      LIVE_NOTICE.safeParse({ type: 'wake_test_heard', line: { ...line, verdict: 'loud' } })
        .success,
    ).toBe(false);
    expect(API_ENDPOINTS.watchWakeTest.access).toBe('owner');
  });

  it('carries a wake claim with its preroll from a node to the hub', () => {
    const message = {
      kind: 'claim',
      claim: { phrase: 'hey aibi', snippetDbfs: -22, preroll: PCM },
    };
    expect(LISTENING_NODE_MESSAGE.parse(message)).toEqual(message);
    expect(NODE_FRAME.parse({ type: 'ear', ear: message })).toEqual({ type: 'ear', ear: message });
  });

  it('carries config and takeover from the hub to a node', () => {
    const config = {
      kind: 'config',
      config: {
        wake: true,
        transcribe: false,
        keywords: ['h e y a i b i @hey aibi'],
        threshold: 0.2,
        nearMissThreshold: 0.08,
        sensitivity: 'standard',
        pause_ms: 200,
      },
    };
    expect(LISTENING_HUB_MESSAGE.parse(config)).toEqual(config);
    const superseded = {
      kind: 'superseded',
      superseded: { winner: { source: 'voice_call', key: 'guild' } },
    };
    expect(HUB_FRAME.parse({ type: 'ear', ear: superseded }).type).toBe('ear');
  });

  it('carries the conversation audio both ways', () => {
    const mic = { kind: 'mic', pcm: PCM };
    expect(NODE_FRAME.parse({ type: 'ear', ear: mic })).toEqual({ type: 'ear', ear: mic });
    const speak = { kind: 'speak', pcm: PCM };
    expect(HUB_FRAME.parse({ type: 'ear', ear: speak })).toEqual({ type: 'ear', ear: speak });
    const call = { kind: 'call', active: true };
    expect(LISTENING_HUB_MESSAGE.parse(call)).toEqual(call);
    expect(LISTENING_HUB_MESSAGE.safeParse({ kind: 'speak', pcm: 'not base64!' }).success).toBe(
      false,
    );
  });
});

describe('transcripts and speech sources of phones and computers', () => {
  it('lists phone and computer transcript sources', () => {
    expect(TRANSCRIPT_SOURCES).toEqual(['camera', 'plugin', 'phone', 'computer']);
  });

  it('chooses phones and computers as speech trigger sources', () => {
    expect(SPEECH_SOURCE.parse({ kind: 'phone', deviceId: ID })).toEqual({
      kind: 'phone',
      deviceId: ID,
    });
    expect(SPEECH_SOURCE.safeParse({ kind: 'computer', chatId: ID }).success).toBe(false);
  });

  it('lists each speech source with its listening state', () => {
    const sources = {
      sources: [
        {
          source: { kind: 'computer', deviceId: ID },
          label: 'Desk',
          listening: { wake: true, transcribe: false, state: 'listening' },
        },
        { source: { kind: 'attachment', chatId: ID }, label: 'Chat', listening: null },
      ],
      unavailable: [],
    };
    expect(SPEECH_SOURCES.parse(sources)).toEqual(sources);
  });

  it('has no language handling in the transcript settings', () => {
    expect(Object.keys(TRANSCRIPT_SETTINGS.parse({}))).toEqual(['retention_days', 'daily_cap_usd']);
    expect(TRANSCRIPT_SETTINGS_CHANGE.safeParse({ approved_languages: ['en'] }).success).toBe(
      false,
    );
  });
});

describe('the phone ear wire', () => {
  it('declares the config, claim and report endpoints for members', () => {
    expect(API_ENDPOINTS.readPhoneListeningConfig).toMatchObject({
      method: 'GET',
      access: 'member',
    });
    expect(API_ENDPOINTS.claimPhoneWake.path).toBe('/api/listening/phone/claims');
    expect(API_ENDPOINTS.reportPhoneListening.path).toBe('/api/listening/phone/reports');
  });

  it('accepts a segment, a level and a state report but not a claim', () => {
    expect(LISTENING_PHONE_REPORT.safeParse({ kind: 'level', dbfs: -30 }).success).toBe(true);
    expect(LISTENING_PHONE_REPORT.safeParse({ kind: 'state', state: null }).success).toBe(true);
    expect(
      LISTENING_PHONE_REPORT.safeParse({
        kind: 'claim',
        claim: { phrase: 'hey', snippetDbfs: -20, preroll: '' },
      }).success,
    ).toBe(false);
  });

  it('carries hub messages to a phone as a live notice', () => {
    expect(
      LIVE_NOTICE.safeParse({
        type: 'listening_ear',
        message: { kind: 'level', watched: true },
      }).success,
    ).toBe(true);
  });
});

describe('ears hosted for the hub', () => {
  const config = {
    wake: true,
    transcribe: false,
    keywords: ['h e y a i b i @hey aibi'],
    threshold: 0.2,
    nearMissThreshold: 0.08,
    sensitivity: 'standard',
    pause_ms: 200,
  };
  const packet = Buffer.from([0xfc, 0xff, 0xfe]).toString('base64');

  it('lets a computer advertise that it can host ears', () => {
    expect(COMPUTER_FEATURES).toContain('ear_host');
    expect(COMPUTER_FEATURE_LIST.parse(['ear_host', 'cpu', 'nope'])).toEqual(['ear_host', 'cpu']);
  });

  it('says a source needs a computer to listen, as a state a source can rest in', () => {
    expect(LISTENING_RUNTIME_STATES).toContain('no_host');
    expect(LISTENING_STATES).toContain('no_host');
    expect(LISTENING_STATE_LABELS.no_host).toBe('Needs a computer to listen');
    expect(LISTENING_NODE_MESSAGE.parse({ kind: 'state', state: 'no_host' })).toEqual({
      kind: 'state',
      state: 'no_host',
    });
  });

  it('names the three sources the hub relays and nothing else', () => {
    expect(EAR_SOURCE_KINDS).toEqual(['camera', 'talk', 'voice_call']);
    EAR_SOURCE_KINDS.forEach((kind) => {
      expect(EAR_SOURCE.parse({ kind, key: 'one' })).toEqual({ kind, key: 'one' });
    });
    expect(EAR_SOURCE.safeParse({ kind: 'phone', key: 'one' }).success).toBe(false);
    expect(EAR_SOURCE.safeParse({ kind: 'computer', key: 'one' }).success).toBe(false);
    expect(EAR_SOURCE.safeParse({ kind: 'camera', key: '' }).success).toBe(false);
    expect(EAR_SOURCE.safeParse({ kind: 'camera', key: 'one', extra: 1 }).success).toBe(false);
  });

  it('knows the two Opus layouts and refuses any other codec', () => {
    expect(EAR_CODEC.parse('opus_48k_mono')).toBe('opus_48k_mono');
    expect(EAR_CODEC.parse('opus_48k_stereo')).toBe('opus_48k_stereo');
    expect(EAR_CODEC.safeParse('opus_16k_mono').success).toBe(false);
    expect(EAR_CODEC.safeParse('pcm').success).toBe(false);
  });

  it('opens, feeds, configures and closes an ear from the hub', () => {
    const open = {
      type: 'ears_open',
      source: { kind: 'voice_call', key: 'guild:speaker' },
      codec: 'opus_48k_stereo',
      config,
    };
    expect(HUB_FRAME.parse(open)).toEqual(open);
    const audio = { type: 'ears_audio', key: 'guild:speaker', packets: [packet, packet] };
    expect(HUB_FRAME.parse(audio)).toEqual(audio);
    const close = { type: 'ears_close', key: 'guild:speaker' };
    expect(HUB_FRAME.parse(close)).toEqual(close);
    const rest = {
      type: 'ears',
      key: 'guild:speaker',
      ear: { kind: 'rest', reason: 'conversation' },
    };
    expect(HUB_FRAME.parse(rest)).toEqual(rest);
  });

  it('refuses a hub frame that opens without a source, a codec or a config', () => {
    const open = {
      type: 'ears_open',
      source: { kind: 'camera', key: 'c' },
      codec: 'opus_48k_mono',
      config,
    };
    expect(HUB_FRAME.safeParse(open).success).toBe(true);
    expect(HUB_FRAME.safeParse({ ...open, source: { kind: 'camera' } }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ ...open, codec: undefined }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ ...open, config: undefined }).success).toBe(false);
  });

  it('refuses empty, missing and unreadable audio and an unnamed ear', () => {
    expect(HUB_FRAME.safeParse({ type: 'ears_audio', key: 'c', packets: [] }).success).toBe(false);
    expect(
      HUB_FRAME.safeParse({ type: 'ears_audio', key: 'c', packets: ['not base64!'] }).success,
    ).toBe(false);
    expect(HUB_FRAME.safeParse({ type: 'ears_audio', key: '', packets: [packet] }).success).toBe(
      false,
    );
    expect(HUB_FRAME.safeParse({ type: 'ears_close', key: '' }).success).toBe(false);
  });

  it('asks a host to score a stretch of speech against the keyword lines and hears the answer', () => {
    const score = {
      type: 'ears_score',
      id: 'one',
      keywords: ['▁A @a'],
      threshold: 0.06,
      pcm: PCM,
    };
    expect(HUB_FRAME.parse(score)).toEqual(score);
    const scored = { type: 'ears_scored', id: 'one', heard: true };
    expect(NODE_FRAME.parse(scored)).toEqual(scored);
    expect(HUB_FRAME.safeParse({ ...score, id: '' }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ ...score, keywords: [] }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ ...score, threshold: 0 }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ ...score, pcm: 'not base64!' }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ ...scored, heard: 'yes' }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ ...scored, id: '' }).success).toBe(false);
    const failed = { type: 'ears_score_failed', id: 'one', reason: 'engine not loaded' };
    expect(NODE_FRAME.parse(failed)).toEqual(failed);
    expect(NODE_FRAME.safeParse({ ...failed, reason: '' }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ ...failed, id: '' }).success).toBe(false);
  });

  it('sends a hosted ear only its config, rest and takeover', () => {
    const configure = { kind: 'config', config };
    const superseded = {
      kind: 'superseded',
      superseded: { winner: { source: 'computer', key: 'k' } },
    };
    expect(REMOTE_EAR_HUB_MESSAGE.parse(configure)).toEqual(configure);
    expect(REMOTE_EAR_HUB_MESSAGE.parse(superseded)).toEqual(superseded);
    expect(REMOTE_EAR_HUB_MESSAGE.safeParse({ kind: 'speak', pcm: packet }).success).toBe(false);
    expect(REMOTE_EAR_HUB_MESSAGE.safeParse({ kind: 'call', active: true }).success).toBe(false);
    expect(REMOTE_EAR_HUB_MESSAGE.safeParse({ kind: 'level', watched: true }).success).toBe(false);
    expect(
      HUB_FRAME.safeParse({ type: 'ears', key: 'c', ear: { kind: 'speak', pcm: packet } }).success,
    ).toBe(false);
  });

  it('hears a claim, speech, a near miss and a state back from a hosted ear', () => {
    const claim = { kind: 'claim', claim: { phrase: 'hey aibi', snippetDbfs: -22, preroll: PCM } };
    const near = { kind: 'near', phrase: 'hey aibi' };
    const segment = { kind: 'segment', segment: { at: AT, endedAt: AT, levelDbfs: -30, pcm: PCM } };
    const state = { kind: 'state', state: null };
    const closed = { kind: 'closed' };
    [claim, near, segment, state, closed].forEach((ear) => {
      expect(REMOTE_EAR_NODE_MESSAGE.parse(ear)).toEqual(ear);
      expect(NODE_FRAME.parse({ type: 'ears', key: 'c', ear })).toEqual({
        type: 'ears',
        key: 'c',
        ear,
      });
    });
    expect(REMOTE_EAR_NODE_MESSAGE.safeParse({ kind: 'mic', pcm: PCM }).success).toBe(false);
    expect(REMOTE_EAR_NODE_MESSAGE.safeParse({ kind: 'level', dbfs: -30 }).success).toBe(false);
    expect(REMOTE_EAR_NODE_MESSAGE.safeParse({ kind: 'closed', extra: 1 }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ type: 'ears', key: '', ear: near }).success).toBe(false);
  });

  it('carries a near miss from a computer ear and refuses one without a phrase', () => {
    const near = { kind: 'near', phrase: 'hey aibi' };
    expect(LISTENING_NODE_MESSAGE.parse(near)).toEqual(near);
    expect(NODE_FRAME.parse({ type: 'ear', ear: near })).toEqual({ type: 'ear', ear: near });
    expect(LISTENING_NODE_MESSAGE.safeParse({ kind: 'near', phrase: '' }).success).toBe(false);
    expect(LISTENING_NODE_MESSAGE.safeParse({ kind: 'near' }).success).toBe(false);
  });

  it('keeps the ear host in the home settings, null until one is chosen', () => {
    const { ear_host_device_id: unset, ...stored } = SETTINGS_ROW.parse({
      home_name: 'Home',
      time_zone: 'UTC',
      latitude: null,
      longitude: null,
      public_url: null,
      public_url_checked_at: null,
      public_url_verified_at: null,
      public_url_error: null,
      ice_servers: [],
      webrtc_candidates: [],
      push_project_id: null,
      updated_at: AT,
    });
    expect(unset).toBeNull();
    expect(SETTINGS_ROW.parse({ ...stored, ear_host_device_id: ID }).ear_host_device_id).toBe(ID);
    expect(SETTINGS_ROW.safeParse({ ...stored, ear_host_device_id: 'kitchen' }).success).toBe(
      false,
    );
  });
});
