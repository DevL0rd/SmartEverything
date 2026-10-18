import type { SpeechSource, SpeechSourceV2 } from '@smarteverything/domain';

export function triggerSourceOf(source: SpeechSource): SpeechSourceV2 {
  if (source.kind === 'camera') return { camera: source.deviceId };
  if (source.kind === 'phone') return { phone: source.deviceId };
  if (source.kind === 'computer') return { computer: source.deviceId };
  if (source.kind === 'attachment') return { chat: source.chatId };
  return { plugin: source.pluginId, sourceId: source.sourceId };
}

export function speechSourceKey(source: SpeechSourceV2): string {
  if ('camera' in source) return `camera:${source.camera}`;
  if ('phone' in source) return `phone:${source.phone}`;
  if ('computer' in source) return `computer:${source.computer}`;
  if ('chat' in source) return `chat:${source.chat}`;
  return `plugin:${source.plugin}:${source.sourceId}`;
}
