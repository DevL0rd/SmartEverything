import type { ReactNode } from 'react';
import { Sheet } from '../../../../components/sheet';
import { countsText, type LiveCheck } from './problem-model';
import type { ProblemHandlers } from './problem-rows';
import { ProblemList } from './problem-rows';

export interface ProblemsSheetProps extends ProblemHandlers {
  readonly open: boolean;
  readonly check: LiveCheck;
  readonly onClose: () => void;
}

export function problemsTitle(check: LiveCheck): string {
  const text = countsText(check.counts);
  return text === null ? 'Problems' : `Problems · ${text}`;
}

export function ProblemsSheet({
  open,
  check,
  onClose,
  onGoTo,
  onFix,
}: ProblemsSheetProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title={problemsTitle(check)} label="Problems">
      <ProblemList groups={check.groups} handlers={{ onGoTo, onFix }} />
    </Sheet>
  );
}
