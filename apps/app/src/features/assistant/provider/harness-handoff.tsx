import type { ReactNode } from 'react';
import type { AiHarnessSession } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import { harnessHandoffActive } from '../model/harness-handoff';

export function HarnessHandoffStatus({
  session,
}: {
  readonly session: AiHarnessSession;
}): ReactNode {
  const handoff = session.handoff;
  if (handoff === null || handoff.stage === 'completed') return null;
  const waiting = harnessHandoffActive(session);
  return (
    <Text
      variant="footnote"
      numberOfLines={2}
      tone={waiting ? 'variant' : 'critical'}
      accessibilityLiveRegion="polite"
    >
      {waiting ? 'Switching devices…' : CHAT_ERROR_MESSAGE}
    </Text>
  );
}
