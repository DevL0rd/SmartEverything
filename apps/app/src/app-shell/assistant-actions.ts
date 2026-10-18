import { href } from './hrefs';
import type { RouteDefinition } from './route-types';

export const ASSISTANT_ACTIONS: NonNullable<RouteDefinition['actions']> = [
  {
    key: 'new-chat',
    title: 'New chat',
    icon: 'pencil',
    href: href.assistantChat('new'),
    keywords: ['start', 'ask', 'conversation', 'compose', 'message', 'write'],
  },
  {
    key: 'model-library',
    title: 'Model library',
    icon: 'brain',
    href: href.settings.page('assistant/models'),
    keywords: ['models', 'LLM', 'change model', 'GPT', 'Claude', 'Gemini', 'browse models'],
  },
  {
    key: 'change-access',
    title: 'Change access',
    icon: 'shield',
    href: href.assistantChat('new', { operation: 'access' }),
    keywords: ['permissions', 'sandbox', 'approvals', 'full access', 'read only', 'ask first'],
  },
  {
    key: 'call',
    title: 'Call the assistant',
    icon: 'phone',
    href: href.assistantCall('palette'),
    keywords: ['voice', 'talk', 'speak', 'ring', 'phone call', 'coordinator'],
  },
  {
    key: 'unread-chats',
    title: 'Unread chats',
    icon: 'circle',
    href: href.assistantChats('unread'),
    keywords: ['new messages', 'inbox', 'not read', 'waiting'],
  },
  {
    key: 'archived-chats',
    title: 'Archived chats',
    icon: 'archive',
    href: href.assistantChats('archived'),
    keywords: ['old', 'hidden', 'restore', 'unarchive'],
  },
];
