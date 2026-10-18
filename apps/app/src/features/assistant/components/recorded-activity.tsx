import { useState, type ReactNode } from 'react';
import { Text } from '../../../components/text';
import { useAssistantStatus } from '../data/assistant-data';
import { summaryOfSteps, type WorkStep } from '../model/work-steps';
import { Disclosure } from '../../../components/disclosure';
import { WorkStepList } from './work-step-list';

export function RecordedActivity({ steps }: { readonly steps: readonly WorkStep[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const shown = useAssistantStatus()?.settings.activity_steps !== false;
  if (!shown || steps.length === 0) return null;
  const summary = summaryOfSteps(steps, false, false);
  return (
    <Disclosure
      label="Recorded activity"
      status={{ label: summary.note, tone: summary.tone === 'failed' ? 'critical' : 'variant' }}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      hint={open ? 'Hide recorded activity' : 'Show recorded activity'}
      bodyClassName="gap-1 pl-4"
    >
      <Text variant="caption" tone="variant">
        Tool positions weren’t saved in this older reply.
      </Text>
      <WorkStepList steps={steps} />
    </Disclosure>
  );
}
