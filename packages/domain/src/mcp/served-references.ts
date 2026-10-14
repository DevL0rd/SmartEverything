import type { Served } from './served-types';

export const SERVED_REFERENCES = [
  [
    'search_chat_references',
    'assistant',
    'read',
    'Search chat references',
    'Search bounded metadata for files, folders, effective runtime capabilities and owned chat titles in an owned chat. Returns exact locators, availability and an opaque continuation; selecting a reference grants no access and does not execute it or load its body.',
    { part: 'search_chat_references' },
  ],
] as const satisfies readonly Served[];
