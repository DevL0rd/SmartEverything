import {
  latestPersonMessage,
  voiceMemory,
  type VoiceMemory,
} from '../../src/assistant-voice/voice-memory';
import { MemoryService } from '../../src/memory/service';
import { hostMemoryChats, hostMemoryRows } from '../../src/store/host/hosted';
import type { SeededStore } from './store';
import { FakeMemoryEmbedder } from './memory-embedder';

export function testVoiceMemory(store: SeededStore): VoiceMemory {
  return voiceMemory(
    new MemoryService(
      hostMemoryRows(store.host),
      hostMemoryChats(store.host),
      new FakeMemoryEmbedder(),
    ),
    (chatId) => latestPersonMessage(store, chatId),
  );
}
