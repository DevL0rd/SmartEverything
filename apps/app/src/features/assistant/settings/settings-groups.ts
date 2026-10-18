import { href } from '../../../app-shell/hrefs';
import { ASSISTANT_PAGES } from '../../../settings/tree-assistant';
import type { SettingDefinition } from '../../../settings/types';

export const ASSISTANT_GROUPS = {
  assistant: 'Assistant',
  models: 'Models',
  conversation: 'Conversation',
  voice: 'Voice and calls',
  budget: 'Budget and costs',
  addOns: 'Add-ons',
  privacy: 'Privacy',
} as const;

class AssistantPageMissingError extends Error {
  override readonly name = 'AssistantPageMissingError';

  constructor(pageId: string) {
    super(`The assistant settings tree has no page ${pageId}.`);
  }
}

export function assistantPageLink(pageId: string, section?: string): SettingDefinition {
  const page = ASSISTANT_PAGES.find((candidate) => candidate.id === pageId);
  if (page === undefined) {
    throw new AssistantPageMissingError(pageId);
  }
  return {
    id: `assistant.page.${pageId}`,
    page: 'assistant',
    ...(section === undefined ? {} : { section }),
    title: page.title,
    icon: page.icon,
    keywords: page.keywords,
    scope: 'client',
    control: 'link',
    href: page.href ?? href.settings.page(pageId),
    ...(page.subtitle === undefined ? {} : { description: page.subtitle }),
    ...(page.visible === undefined ? {} : { visible: page.visible }),
    ...(page.summary === undefined ? {} : { value: page.summary }),
  };
}
