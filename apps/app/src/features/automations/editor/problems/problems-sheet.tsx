import type { ReactNode } from 'react';
import { Sheet } from '../../../../components/sheet';
import type { LiveCheck } from './problem-model';
import type { ProblemHandlers } from './problem-rows';
import { ProblemList } from './problem-rows';

export interface ProblemsSheetProps extends ProblemHandlers {
  readonly open: boolean;
  readonly check: LiveCheck;
  readonly onClose: () => void;
}

export function problemsTitle(check: LiveCheck): string {
  const { errors, warnings, hints } = check.counts;
  if (errors + warnings + hints === 0) return 'Problems';
  const parts = [
    errors === 0 ? null : `${String(errors)} to fix`,
    warnings === 0 ? null : `${String(warnings)} to know`,
    hints === 0 ? null : `${String(hints)} to improve`,
  ];
  return `Problems · ${parts.filter((part) => part !== null).join(', ')}`;
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
