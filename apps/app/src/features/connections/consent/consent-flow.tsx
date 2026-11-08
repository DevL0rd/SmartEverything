import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { McpConsentRequest } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useConsentRequests, useSyncStatus } from '../../../store/selectors';
import { FlowButton } from '../flows/flow-button';
import { leaveFlow } from '../flows/leave-flow';
import { ConsentButtons, ConsentDetails, consentTitle } from './consent-card';
import { useDecide } from './use-decide';

function Waiting({ request }: { readonly request: McpConsentRequest }): ReactNode {
  const decision = useDecide(request, leaveFlow);
  const touch = useIdiom() === 'touch';
  const title = consentTitle(request);
  return (
    <FlowFrame
      title={touch ? 'Allow access' : title}
      onCancel={leaveFlow}
      footer={<ConsentButtons decision={decision} grow={touch} />}
    >
      {touch ? (
        <View className="gap-3">
          <Text variant="title-3" accessibilityRole="header">
            {title}
          </Text>
          <ConsentDetails request={request} />
        </View>
      ) : (
        <ConsentDetails request={request} />
      )}
    </FlowFrame>
  );
}

export function ConsentFlow(): ReactNode {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const request = useConsentRequests().find((item) => item.id === requestId);
  const live = useSyncStatus().status === 'live';
  if (request === undefined && !live) {
    return (
      <FlowFrame title="Allow access" onCancel={leaveFlow}>
        <Skeleton shape="block" />
      </FlowFrame>
    );
  }
  if (request === undefined) {
    return (
      <FlowFrame
        title="Allow access"
        onCancel={leaveFlow}
        footer={<FlowButton label="Close" onPress={leaveFlow} />}
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
