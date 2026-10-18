import { randomUUID } from 'node:crypto';
import type { AiHtmlPreviewPublication } from '@smarteverything/domain';
import type { HtmlPublication } from '../../src/preview/documents';
import type { Rig } from '../assistant/harness/support/rig';

export function htmlPublication(
  rig: Rig,
  chatId: string,
  revision = randomUUID(),
): HtmlPublication {
  const view: AiHtmlPreviewPublication = {
    kind: 'html',
    id: randomUUID(),
    revision,
    chat_id: chatId,
    profile_id: rig.owner.profileId,
    title: 'Page',
    initial_path: '/',
    expires_at: null,
  };
  return { view, readHtml: () => Promise.resolve('<p>page</p>') };
}
