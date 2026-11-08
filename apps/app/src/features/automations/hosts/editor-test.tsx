import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type {
  AutomationRunStartReply,
  AutomationV4,
  NodeKindLookup,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useAutomationsSource } from '../data/source';
import { useAutomationPrefs } from '../data/use-automation-prefs';
import { breakpointsOf } from '../data/prefs-edit';
import { payloadFieldsOf, type PayloadField } from '../runs/test/test-model';
import { TestSheet } from '../runs/test/test-sheet';
import { useTestStart } from '../runs/test/use-test-start';
import { runHref } from './host-links';

export const PUBLISHED_ONLY =
  'A test runs the published version. Publish first to test your latest changes.';

export function triggerFieldsOf(
  program: AutomationV4 | null,
  kinds: NodeKindLookup,
): readonly PayloadField[] {
  const first = program?.triggers[0];
  if (first === undefined) return [];
  return payloadFieldsOf(kinds.get(first.kind)?.outputs ?? []);
}

function useOnStarted(): (reply: AutomationRunStartReply) => void {
  const router = useRouter();
  return (reply) => {
    if (reply.run === null) notify({ message: reply.summary, tone: 'critical' });
    else router.push(runHref(reply.run));
  };
}

function useBreakpoints(automationId: string): readonly string[] {
  const read = useAutomationPrefs().breakpoints;
  return read.status === 'ready' ? breakpointsOf(read.value, automationId) : [];
}

export function EditorTest({
  automationId,
  name,
  program,
  open,
  onClose,
}: {
  readonly automationId: string;
  readonly name: string;
  readonly program: AutomationV4 | null;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const onStarted = useOnStarted();
  const test = useTestStart((reply) => {
    onClose();
    onStarted(reply);
  });
  const breakpoints = useBreakpoints(automationId);
  const { lookup } = useAutomationsSource();
  return (
    <TestSheet
      open={open}
      automationId={automationId}
      name={name}
      note={PUBLISHED_ONLY}
      fields={triggerFieldsOf(program, lookup)}
      lastEvent={null}
      breakpoints={breakpoints}
      starting={test.starting}
      onClose={onClose}
      onTest={test.startTest}
      onRealRun={test.start}
    />
  );
}
