import type { ReactNode } from 'react';
import { CollapseBody, CollapseRoot } from '../../../components/disclosure';
import { plural } from '../../../format/text';
import { useAssistantStatus } from '../data/assistant-data';
import { summaryOfSteps, type WorkStep } from '../model/work-steps';
import {
  ActivityLine,
  WorkStepList,
  useActivityOpen,
  type ActivityLineText,
} from './work-step-list';

export function recordedLineOf(steps: readonly WorkStep[]): ActivityLineText {
  const summary = summaryOfSteps(steps, false, false);
  const failed = summary.tone === 'failed';
  const lead = failed ? summary.title : `Used ${plural(steps.length, 'step')}`;
  return { glyph: failed ? 'partial' : 'done', lead, notes: [], verbs: [], label: lead };
}

export function RecordedActivity({
  messageId,
  steps,
}: {
  readonly messageId: string;
  readonly steps: readonly WorkStep[];
}): ReactNode {
  const [open, toggle] = useActivityOpen(messageId, false);
  const shown = useAssistantStatus()?.settings.activity_steps !== false;
  if (!shown || steps.length === 0) return null;
  return (
    <CollapseRoot className="min-w-0">
      <ActivityLine
        text={recordedLineOf(steps)}
        duration={null}
        live={false}
        open={open}
        onToggle={toggle}
      />
      {open ? (
        <CollapseBody>
          <WorkStepList steps={steps} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
