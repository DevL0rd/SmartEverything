import { describe, expect, it } from 'vitest';
import { AI_PROJECT_PREVIEW_SOURCE } from '../src/ai-preview-documents';
import { AI_PREVIEW_SERVICE_WRITE } from '../src/ai-previews';
import { CODEX_NATIVE_NOTICE } from '../src/codex-prompts';
import { ASSISTANT_NEW_MESSAGE } from '../src/api/endpoints-assistant';
import { NODE_RUNTIME_FRAME } from '../src/node/ai-frames';
import { audioChangeFeature } from '../src/node/computer-change-features';
import { AUDIO_CHANGE } from '../src/node/computer-audio';
import { SHELLY_SCRIPT_EXAMPLE } from '../src/shelly-presence-advanced-actions';
import { COMPUTER_RUNTIME_STATUS } from '../src/computer-ai-runtime';
import { DEFAULT_CODEX_AI_SETTINGS } from '../src/codex';
import { DEFAULT_COMPUTER_AI_SETTINGS } from '../src/computer-ai';

const ID = '3a000000-0000-4000-8000-0000000000a1';

describe('a script example name', () => {
  const base = { title: 'Example' };

  it('is a relative path to a script, not a way out of the library', () => {
    expect(SHELLY_SCRIPT_EXAMPLE.safeParse({ ...base, fname: 'examples/a.js' }).success).toBe(true);
    for (const fname of ['/etc/a.js', '../a.js', 'a/../b.js', 'a.txt']) {
      expect(SHELLY_SCRIPT_EXAMPLE.safeParse({ ...base, fname }).success).toBe(false);
    }
  });
});

describe('a Codex session notice', () => {
  it('names the session by a non-empty id', () => {
    expect(
      CODEX_NATIVE_NOTICE.safeParse({ type: 'codex_session', session: 'thread-1', payload: {} })
        .success,
    ).toBe(true);
    expect(
      CODEX_NATIVE_NOTICE.safeParse({ type: 'codex_session', session: '', payload: {} }).success,
    ).toBe(false);
  });
});

describe('a new assistant message', () => {
  it('may be only attachments but never nothing', () => {
    expect(ASSISTANT_NEW_MESSAGE.safeParse({ text: 'hello' }).success).toBe(true);
    expect(ASSISTANT_NEW_MESSAGE.safeParse({ text: '', attachments: [ID] }).success).toBe(true);
    expect(ASSISTANT_NEW_MESSAGE.safeParse({ text: '  ' }).success).toBe(false);
  });
});

describe('a preview service address', () => {
  const base = {
    origin: 'http://127.0.0.1:3000',
    title: 'Dev server',
    service_scope: 'authorized_workspace_service',
  };

  it('starts on a path of its own site and never on another host or a broken line', () => {
    expect(AI_PREVIEW_SERVICE_WRITE.safeParse({ ...base, initial_path: '/docs' }).success).toBe(
      true,
    );
    expect(AI_PREVIEW_SERVICE_WRITE.safeParse(base).success).toBe(true);
    for (const initial_path of ['docs', '//evil.example', '/a\nb', '/a\\b']) {
      expect(AI_PREVIEW_SERVICE_WRITE.safeParse({ ...base, initial_path }).success).toBe(false);
    }
  });

  it('keeps project previews to a plain html entry', () => {
    expect(AI_PROJECT_PREVIEW_SOURCE.shape.entry.safeParse('site/index.html').success).toBe(true);
  });
});

describe('a runtime hello', () => {
  it('registers each runtime once', () => {
    const hello = {
      type: 'hello',
      protocol: 2,
      hello: {},
      runtimes: ['claude', 'claude'],
    };
    expect(NODE_RUNTIME_FRAME.safeParse(hello).success).toBe(false);
  });
});

describe('audioChangeFeature', () => {
  it('files app changes under per-app audio and device changes by input or output', () => {
    expect(
      audioChangeFeature(AUDIO_CHANGE.parse({ action: 'app_volume', app: 'x', level: 10 })),
    ).toBe('audio_apps');
    expect(
      audioChangeFeature(AUDIO_CHANGE.parse({ action: 'app_mute', app: 'x', muted: true })),
    ).toBe('audio_apps');
    expect(
      audioChangeFeature(AUDIO_CHANGE.parse({ action: 'app_output', app: 'x', output: 'd' })),
    ).toBe('audio_apps');
    expect(audioChangeFeature(AUDIO_CHANGE.parse({ action: 'volume', level: 10 }))).toBe('audio');
    expect(
      audioChangeFeature(AUDIO_CHANGE.parse({ action: 'mute', muted: true, kind: 'input' })),
    ).toBe('microphone');
    expect(
      audioChangeFeature(AUDIO_CHANGE.parse({ action: 'default', kind: 'input', device: 'd' })),
    ).toBe('microphone');
  });
});

describe('a runtime status', () => {
  const status = {
    device_id: ID,
    local: true,
    online: true,
    capabilities: {
      runtime_version: null,
      capability_revision: 'r',
      operations: [],
      settings: [],
      control_reason: null,
      provider_reason: null,
      authentication: 'unknown',
      subscription: 'unverified',
      input_modalities: [],
      local_features: {},
    },
  };

  it('needs the status and its settings to speak of the same runtime', () => {
    const claude = { runtime: 'claude', settings: DEFAULT_COMPUTER_AI_SETTINGS };
    const codex = { runtime: 'codex', settings: DEFAULT_CODEX_AI_SETTINGS };
    expect(
      COMPUTER_RUNTIME_STATUS.safeParse({ ...status, runtime: 'claude', settings: claude }).success,
    ).toBe(true);
    const mixed = COMPUTER_RUNTIME_STATUS.safeParse({
      ...status,
      runtime: 'claude',
      settings: codex,
    });
    expect(mixed.success).toBe(false);
    expect(mixed.error?.issues[0]?.message).toBe('Runtime status and settings must agree.');
  });
});
