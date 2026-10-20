import { describe, expect, it } from 'vitest';
import { encodedPowerShell } from '../src/firewall-plan';
import { assistantVoiceProtocols, ASSISTANT_VOICE_PROTOCOL } from '../src/assistant-voice';
import { mcpConsentPush } from '../src/api/assistants';
import { bodyReadingPush } from '../src/body-readings';
import { isChatActivity } from '../src/ai-chats';
import { noLegacy } from '../src/client-pref-definition';
import { colorFromInput } from '../src/color-input';
import { computerRuntimeKey } from '../src/computer-ai-runtime';
import { dangerOf } from '../src/presentation/danger';
import { HUB_GUARD_MESSAGE, computerGuardBlocks, isHubOwnUnit } from '../src/node/computer-role';
import { legacyAssistantSettings } from '../src/assistant-settings-patch';
import { listeningKindOf } from '../src/listening';
import { sensorLabel } from '../src/node/readable-label';
import { signalKey } from '../src/signals';
import { talkMemberKey } from '../src/talk';
import { tvPathsFor } from '../src/television-values';
import { transcriptRetentionLabel } from '../src/transcripts';
import { isPreviewControl } from '../src/ai-preview-files';
import type { DeviceCapability } from '../src/devices';
import { ASSISTANT_SETTINGS_WRITE } from '../src/assistant';
import { HUB_HARNESS_CONTROL } from '../src/node/harness-frames';

const ID = '3a000000-0000-4000-8000-0000000000a1';

describe('identifiers', () => {
  it('keys a signal by source, kind, subject and field, leaving empty parts empty', () => {
    expect(signalKey({ source: 'device', kind: 'state', subject: 'lamp', field: 'power' })).toBe(
      'device|state|lamp|power',
    );
    expect(signalKey({ source: 'weather', kind: 'now', subject: null, field: null })).toBe(
      'weather|now||',
    );
  });

  it('keys a talk member by channel, kind and member', () => {
    expect(talkMemberKey({ channel_id: 'c1', member_kind: 'client', member_id: 'p1' })).toBe(
      'c1/client/p1',
    );
  });

  it('keys a computer runtime by device and runtime', () => {
    expect(computerRuntimeKey({ device_id: ID, runtime: 'claude' })).toBe(`["${ID}","claude"]`);
  });

  it('encodes a script as base64 UTF-16 little-endian for PowerShell', () => {
    expect(encodedPowerShell('ab')).toBe('YQBiAA==');
    expect(Buffer.from(encodedPowerShell('Get-Date'), 'base64').toString('utf16le')).toBe(
      'Get-Date',
    );
  });

  it('offers the voice sockets the protocol name and the bearer token, refusing a bad token', () => {
    const token = `set_${'a'.repeat(64)}`;
    expect(assistantVoiceProtocols(token)).toStrictEqual([
      ASSISTANT_VOICE_PROTOCOL,
      `bearer.${token}`,
    ]);
    expect(() => assistantVoiceProtocols('nope')).toThrow();
  });
});

describe('notifications', () => {
  it('asks about an MCP client by its name and home', () => {
    expect(
      mcpConsentPush(
        {
          id: ID,
          clientName: 'Claude',
          clientUri: null,
          access: ['read'],
          requestedAt: '2026-10-08T07:00:00Z',
          expiresAt: '2026-10-08T07:10:00Z',
        },
        'Home',
      ),
    ).toStrictEqual({
      title: 'Claude wants access',
      body: 'Allow or deny it for Home in SmartEverything.',
      data: { kind: 'mcp_consent', consentId: ID },
    });
  });

  it('asks who stood on the scale, with the weight when known', () => {
    expect(bodyReadingPush({ id: ID, weight_kg: 71.26 })).toStrictEqual({
      title: 'Who was this?',
      body: '71.3 kg on the scale. Tap to say who.',
      data: { kind: 'body_reading', readingId: ID },
    });
    expect(bodyReadingPush({ id: ID, weight_kg: null }).body).toBe(
      'A weigh-in on the scale. Tap to say who.',
    );
  });
});

describe('labels', () => {
  it('says one day or many', () => {
    expect(transcriptRetentionLabel(1)).toBe('1 day');
    expect(transcriptRetentionLabel(30)).toBe('30 days');
  });

  it('names GPU temperature sensors by what they measure, and other chips by their kind', () => {
    expect(sensorLabel('amdgpu-pci-0300', 'junction')).toBe('GPU hotspot');
    expect(sensorLabel('amdgpu-pci-0300', 'edge')).toBe('GPU edge');
    expect(sensorLabel('amdgpu-pci-0300', 'fan1')).toBe('Fan1');
    expect(sensorLabel('nvme-pci-0100', 'nvme-pci-0100')).toBe('NVMe drive');
    expect(sensorLabel('coretemp-isa-0000', 'Package id 0')).toBe('Package id 0');
    expect(sensorLabel('unknownchip', 'unknownchip')).toBe('Unknownchip');
    expect(sensorLabel('pch_cannonlake-virtual-0', 'pch_cannonlake-virtual-0')).toBe(
      'Chipset (Cannonlake-virtual-0)',
    );
  });
});

describe('danger of an action', () => {
  function action(label: string): DeviceCapability {
    return { key: 'raw:thing', label, access: 'write', value: { kind: 'action' } };
  }

  it('asks for a typed word for wiping actions, a confirmation for restarts, nothing otherwise', () => {
    expect(dangerOf(action('Format storage'))).toStrictEqual({ tier: 'typed', word: 'FORMAT' });
    expect(dangerOf(action('Factory reset'))).toStrictEqual({ tier: 'typed', word: 'RESET' });
    expect(dangerOf(action('Delete users'))).toStrictEqual({ tier: 'typed', word: 'DELETE' });
    expect(dangerOf(action('Erase data'))).toStrictEqual({ tier: 'typed', word: 'ERASE' });
    expect(dangerOf(action('Restart'))).toStrictEqual({ tier: 'confirm' });
    expect(dangerOf(action('Start cleaning'))).toStrictEqual({ tier: 'none' });
    expect(
      dangerOf({ key: 'power', label: 'Format', access: 'read_write', value: { kind: 'boolean' } }),
    ).toStrictEqual({ tier: 'none' });
  });
});

describe('guards on the hub computer', () => {
  it('recognises the hub own units by name', () => {
    expect(isHubOwnUnit('smarteverything')).toBe(true);
    expect(isHubOwnUnit(' smarteverything-hub.service ')).toBe(true);
    expect(isHubOwnUnit('smarteverything@1')).toBe(true);
    expect(isHubOwnUnit('smarteverythingelse')).toBe(false);
    expect(isHubOwnUnit('nginx')).toBe(false);
  });

  it('blocks power, own-service and own-process requests on the hub unless confirmed', () => {
    expect(computerGuardBlocks('hub', { kind: 'power', action: 'restart' }, false)).toBe(true);
    expect(computerGuardBlocks('hub', { kind: 'own_service', operation: 'stop' }, false)).toBe(
      true,
    );
    expect(computerGuardBlocks('hub', { kind: 'own_service', operation: 'start' }, false)).toBe(
      false,
    );
    expect(computerGuardBlocks('hub', { kind: 'own_process', signal: 'force' }, false)).toBe(true);
    expect(computerGuardBlocks('hub', { kind: 'own_process', signal: 'continue' }, false)).toBe(
      false,
    );
    expect(computerGuardBlocks('hub', { kind: 'own_process', signal: 'force' }, true)).toBe(false);
    expect(computerGuardBlocks('pc', { kind: 'own_process', signal: 'force' }, false)).toBe(false);
    expect(HUB_GUARD_MESSAGE).toMatch(/explicit confirmation/);
  });
});

describe('small rules', () => {
  it('counts every message but system notices as chat activity, except calls', () => {
    expect(isChatActivity({ role: 'person', kind: 'text' })).toBe(true);
    expect(isChatActivity({ role: 'system', kind: 'text' })).toBe(false);
    expect(isChatActivity({ role: 'system', kind: 'call' })).toBe(true);
  });

  it('has no older shape for preferences that never had one', () => {
    expect(noLegacy()).toBeNull();
  });

  it('maps a wake source to the kind of listening source', () => {
    expect(listeningKindOf('camera')).toBe('camera');
    expect(listeningKindOf('phone')).toBe('phone');
    expect(listeningKindOf('computer')).toBe('computer');
    expect(listeningKindOf('talk')).toBe('walkie');
    expect(listeningKindOf('voice_call')).toBe('discord');
  });

  it('starts every television with the SmartThings path and no IR remote', () => {
    expect(tvPathsFor(true, false)).toStrictEqual({
      smartthings: true,
      direct: { attached: true },
      wake: false,
      irRemoteId: null,
      irButtons: [],
    });
    expect(tvPathsFor(false, true)).toMatchObject({ direct: { attached: false }, wake: true });
  });

  it('reads colours from text, json and channels and gives up on broken json', () => {
    expect(colorFromInput('#ff0000')).toMatchObject({ hue: 0, saturation: 100, value: 100 });
    expect(colorFromInput('{"hue":120,"saturation":50,"value":50}')).toStrictEqual({
      hue: 120,
      saturation: 50,
      value: 50,
    });
    expect(colorFromInput('{broken')).toBeNull();
    expect(colorFromInput('[broken')).toBeNull();
  });

  it('tells preview control frames from the others', () => {
    const bound = { device_id: ID, generation: ID, runtime_instance: ID };
    const close = HUB_HARNESS_CONTROL.parse({
      ...bound,
      type: 'preview_file_close',
      watch_handle: ID,
    });
    const cancel = HUB_HARNESS_CONTROL.parse({
      ...bound,
      type: 'harness_subscription_inference_cancel',
      id: ID,
    });
    expect(isPreviewControl(close)).toBe(true);
    expect(isPreviewControl(cancel)).toBe(false);
  });

  it('removes the response style when writing settings for an older hub', () => {
    const settings = ASSISTANT_SETTINGS_WRITE.parse({
      response_style: { personality: 'default' },
    });
    expect(settings.response_style).toBeDefined();
    expect('response_style' in legacyAssistantSettings(settings)).toBe(false);
  });
});
