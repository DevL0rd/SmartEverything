import type { ReactNode } from 'react';
import { useProviderLink } from '../../../store/selectors';
import { stageOf } from '../model/link-stage';
import { FlowButton } from './flow-button';
import { closeFlow } from './use-link-flow';
import type { SmartThingsFlow } from './use-smartthings-flow';

function SignInFooter({
  flow,
  baseline,
}: {
  readonly flow: SmartThingsFlow;
  readonly baseline: string | null;
}): ReactNode {
  const stage = stageOf(useProviderLink('smartthings'), { baseline });
  if (stage.kind === 'done') {
    return <FlowButton label="Done" onPress={closeFlow} />;
  }
  return (
    <FlowButton
      label={stage.kind === 'failed' ? 'Sign in again' : 'Open Samsung sign-in'}
      variant={stage.kind === 'failed' ? 'filled' : 'tonal'}
      onPress={flow.signInAgain}
    />
  );
}

export function SmartThingsFooter({ flow }: { readonly flow: SmartThingsFlow }): ReactNode {
  const { step } = flow;
  switch (step.kind) {
    case 'token':
      return <FlowButton label="Continue" disabled={flow.token.trim() === ''} onPress={flow.run} />;
    case 'creating':
      return <FlowButton label="Working…" loading disabled onPress={flow.run} />;
    case 'not_confirmed':
      return <FlowButton label="Try again" onPress={flow.run} />;
    case 'signin':
      return <SignInFooter flow={flow} baseline={step.baseline} />;
  }
}
