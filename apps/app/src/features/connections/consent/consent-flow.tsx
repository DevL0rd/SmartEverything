import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { McpConsentRequest } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Skeleton } from '../../../components/skeleton';
import { useIdiom } from '../../../design/platform';
import { useConsentRequests, useSyncStatus } from '../../../store/selectors';
import { FlowButton } from '../flows/flow-button';
import { closeFlow } from '../flows/use-link-flow';
import { ConsentButtons, ConsentDetails, consentTitle } from './consent-card';
import { useDecide } from './use-decide';

function Waiting({ request }: { readonly request: McpConsentRequest }): ReactNode {
  const decision = useDecide(request, closeFlow);
  return (
    <FlowFrame
      title={consentTitle(request)}
      onCancel={closeFlow}
      footer={<ConsentButtons decision={decision} grow={useIdiom() === 'touch'} />}
    >
      <ConsentDetails request={request} />
    </FlowFrame>
  );
}

export function ConsentFlow(): ReactNode {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const request = useConsentRequests().find((item) => item.id === requestId);
  const live = useSyncStatus().status === 'live';
  if (request === undefined && !live) {
    return (
      <FlowFrame title="Allow access" onCancel={closeFlow}>
        <Skeleton shape="block" />
      </FlowFrame>
    );
  }
  if (request === undefined) {
    return (
      <FlowFrame
        title="Allow access"
        onCancel={closeFlow}
        footer={<FlowButton label="Close" onPress={closeFlow} />}
      >
        <EmptyState
          icon="circleCheck"
          title="Already answered"
          body="This request was answered or has expired."
        />
      </FlowFrame>
    );
  }
  return <Waiting request={request} />;
}
