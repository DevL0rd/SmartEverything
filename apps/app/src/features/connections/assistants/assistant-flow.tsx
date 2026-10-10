import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { closeFlow } from '../flows/use-link-flow';
import { assistantOf } from '../model/assistants';
import { OAuthFlow } from './oauth-flow';
import { TokenFlow } from './token-flow';

export function AssistantFlow(): ReactNode {
  const { assistant: key } = useLocalSearchParams<{ assistant: string }>();
  const assistant = assistantOf(key);
  if (assistant === null) {
    return (
      <FlowFrame title="Connect an assistant" onCancel={closeFlow}>
        <EmptyState
          icon="sparkles"
          title="Unknown assistant"
          body="Pick one in Assistant › Integrations."
        />
      </FlowFrame>
    );
  }
  return assistant.kind === 'oauth' ? (
    <OAuthFlow assistant={assistant} />
  ) : (
    <TokenFlow assistant={assistant} />
  );
}
