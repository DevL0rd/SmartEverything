import type { SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { BROWSER_ACTIONS } from '../features/assistant';
import type { SearchChat, SourceLinks } from './sources';
export function browserSearchPages(chat: SearchChat, out: SourceLinks): SearchSources['pages'] {
  return BROWSER_ACTIONS.map((action) => {
    const path = `chat:${chat.id}#browser:${action.id}`;
    out.links.set(
      `page:${path}`,
      href.assistantChat(chat.id, { section: 'browser', browserAction: action.id }),
    );
    out.icons.set(`page:${path}`, action.icon);
    out.parents.set(`page:${path}`, `page:chat:${chat.id}#browser`);
    return {
      path,
      title: action.title,
      description: chat.title,
      keywords: ['browser', 'preview', ...action.keywords],
    };
  });
}
