import {
  AI_MEMORY,
  AI_MEMORY_ADD,
  AI_MEMORY_CHANGE,
  AI_MEMORY_FORGET,
  AI_MEMORY_FORGOTTEN,
  AI_MEMORY_PARAMS,
  AI_MEMORY_LIST,
  AI_MEMORY_SETTINGS,
  AI_MEMORY_SETTINGS_CHANGE,
} from '../ai-memory';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const AI_MEMORY_ENDPOINTS = {
  listAiMemories: endpoint({
    method: 'GET',
    path: '/api/ai/memory/items',
    access: 'member',
    summary:
      'List what the AI remembers for the caller: their own private memories and the home memories, with the caller’s memory settings',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_MEMORY_LIST,
  }),
  addAiMemory: endpoint({
    method: 'POST',
    path: '/api/ai/memory/items',
    access: 'member',
    summary:
      'Add a memory for the caller, or a home memory shared by everyone in the home when the caller is an owner',
    params: NOTHING,
    query: NOTHING,
    body: AI_MEMORY_ADD,
    response: AI_MEMORY,
  }),
  changeAiMemory: endpoint({
    method: 'PATCH',
    path: '/api/ai/memory/items/:memoryId',
    access: 'member',
    summary: 'Reword one of the caller’s memories, or a home memory when the caller is an owner',
    params: AI_MEMORY_PARAMS,
    query: NOTHING,
    body: AI_MEMORY_CHANGE,
    response: AI_MEMORY,
  }),
  removeAiMemory: endpoint({
    method: 'DELETE',
    path: '/api/ai/memory/items/:memoryId',
    access: 'member',
    summary: 'Delete one of the caller’s memories, or a home memory when the caller is an owner',
    params: AI_MEMORY_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  forgetAiMemories: endpoint({
    method: 'DELETE',
    path: '/api/ai/memory/items',
    access: 'member',
    summary:
      'Forget everything the AI remembers in one scope: all of the caller’s own memories, or all home memories when the caller is an owner',
    params: NOTHING,
    query: AI_MEMORY_FORGET,
    body: NO_BODY,
    response: AI_MEMORY_FORGOTTEN,
  }),
  changeAiMemorySettings: endpoint({
    method: 'PATCH',
    path: '/api/ai/memory/settings',
    access: 'member',
    summary:
      'Turn the AI’s memory on or off for the caller and set how much of it is shown at the start of a chat',
    params: NOTHING,
    query: NOTHING,
    body: AI_MEMORY_SETTINGS_CHANGE,
    response: AI_MEMORY_SETTINGS,
  }),
} as const;
