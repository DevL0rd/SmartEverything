import type { AiHarnessPermission } from '@smarteverything/domain';
import { accessFootnoteText, type AccessModel, type ToolsAccess } from './access-model';
import { harnessSections, type AccessBlock } from './harness-access';
import { accessPill } from './ai-access';

export interface HarnessModelInput {
  readonly host: string;
  readonly permissions: readonly AiHarnessPermission[];
  readonly current: AiHarnessPermission;
  readonly block: AccessBlock | null;
  readonly applying: string | null;
  readonly memberNote: boolean;
  readonly tools: ToolsAccess | null;
  readonly onCheck: (() => void) | null;
  readonly select: (sectionId: string, value: string) => void;
}

export function harnessModel(input: HarnessModelInput): AccessModel {
  const { block, onCheck } = input;
  return {
    title: `Access on ${input.host}`,
    pill: accessPill({ kind: 'harness', permission: input.current }),
    nextTurn: false,
    sections: harnessSections(input.permissions, input.current, input.host),
    applying: input.applying,
    blocked: block !== null,
    banner:
      block === null
        ? null
        : {
            icon: block.icon,
            text: block.text,
            action:
              block.kind === 'confirm' && onCheck !== null
                ? { label: 'Check again', onPress: onCheck }
                : null,
          },
    footnote: accessFootnoteText('harness', false, input.memberNote),
    tools: input.tools,
    cloud: null,
    select: input.select,
  };
}
