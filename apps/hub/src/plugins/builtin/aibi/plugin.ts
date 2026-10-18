import {
  ROBOT_ACTIVITY_STREAM,
  ROBOT_MOVES_STREAM,
  ROBOT_PLUGIN_ID,
  ROBOT_STATUS_STREAM,
  type PluginManifestInput,
} from '@smarteverything/domain';
import type { BuiltinPlugin } from '../contract';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { startAibi, type AibiEnvironment } from './runtime';
import { AIBI_SETTINGS } from './settings';
import { AIBI_SETTINGS_FORM } from './settings-form';

const AIBI_MANIFEST: PluginManifestInput = {
  id: ROBOT_PLUGIN_ID,
  name: 'AIBI robot',
  version: '1.0.0',
  description:
    'Talk with AIBI, the small desk robot: this server answers it instead of its cloud, listens, speaks, moves it and shows how it is doing.',
  publisher: 'SmartEverything',
  icon: 'bot',
  permissions: {
    inbound: true,
    voice: true,
    network: true,
    files: 'own',
    listen: [
      { protocol: 'udp', port: 53, purpose: 'Tell AIBI where its server is' },
      { protocol: 'tcp', port: 53, purpose: 'Tell AIBI where its server is' },
      { protocol: 'tcp', port: 80, purpose: 'Send AIBI its speech' },
      { protocol: 'tcp', port: 443, purpose: 'Answer AIBI’s requests' },
    ],
  },
  contributes: {
    data: [
      { stream: ROBOT_STATUS_STREAM, title: 'AIBI status', schema: { type: 'object' }, history: 0 },
      {
        stream: ROBOT_ACTIVITY_STREAM,
        title: 'AIBI activity',
        schema: { type: 'object' },
        history: 0,
      },
      { stream: ROBOT_MOVES_STREAM, title: 'AIBI moves', schema: { type: 'object' }, history: 0 },
    ],
    events: [
      { kind: 'conversation_started', title: 'AIBI started a conversation' },
      { kind: 'conversation_ended', title: 'AIBI’s conversation ended' },
    ],
    widgets: [
      figureWidget('aibi-status', 'AIBI', 'bot', ROBOT_STATUS_STREAM),
      figureWidget(
        'aibi-conversation',
        'AIBI conversation',
        'messageCircle',
        ROBOT_ACTIVITY_STREAM,
      ),
      figureWidget('aibi-moves', 'AIBI moves', 'move', ROBOT_MOVES_STREAM),
    ],
    settings: AIBI_SETTINGS_FORM,
    search: 'push',
    deviceFamilies: ['robot'],
  },
};

export function createAibiPlugin(environment: AibiEnvironment): BuiltinPlugin {
  return defineBuiltinPlugin({
    manifest: AIBI_MANIFEST,
    settings: AIBI_SETTINGS,
    start: (ctx) => startAibi(ctx, environment),
  });
}
