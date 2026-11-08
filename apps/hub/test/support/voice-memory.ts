import {
  latestPersonMessage,
  voiceMemory,
  type VoiceMemory,
} from '../../src/assistant-voice/voice-memory';
import { MemoryService } from '../../src/memory/service';
import type { Store } from '../../src/store/store';
import { FakeMemoryEmbedder } from './memory-embedder';

export function testVoiceMemory(store: Store): VoiceMemory {
  return voiceMemory(
    new MemoryService(store.aiMemories, store.aiChats, new FakeMemoryEmbedder()),
    (chatId) => latestPersonMessage(store, chatId),
  );
}
