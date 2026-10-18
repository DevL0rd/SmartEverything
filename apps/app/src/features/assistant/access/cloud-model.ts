import type { AiChatRow } from '@smarteverything/domain';
import { accessFootnoteText, type AccessModel } from './access-model';
import { accessPill } from './ai-access';
import { allowedToolCount, openMachinePanel, toolsAccess } from './tools-access';

const CLOUD_INTRO = 'This chat uses Home Hub’s cloud model with the tools you allow.';

export function cloudModel(chat: Pick<AiChatRow, 'tools'> | undefined): AccessModel {
  const scope = chat ?? { tools: null };
  return {
    title: 'Access on Home Hub',
    pill: accessPill({ kind: 'cloud', allowedTools: allowedToolCount(scope).on }),
    nextTurn: false,
    sections: [],
    applying: null,
    blocked: false,
    banner: null,
    footnote: accessFootnoteText('cloud', false, false),
    tools: chat === undefined ? null : toolsAccess(chat),
    cloud: { intro: CLOUD_INTRO, onComputer: openMachinePanel },
    select: (): void => undefined,
  };
}
