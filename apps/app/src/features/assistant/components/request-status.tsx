import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { resend } from '../data/send';
import { TypingDots } from './typing-dots';
import { WorkSummary, stepsOf } from './work-summary';

function Failed({ request }: { readonly request: AssistantMessageRow }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <Icon name="alert" size={16} tone="critical" />
      <Text variant="footnote" tone="critical" className="shrink">
        {request.reason ?? 'Not delivered'}
      </Text>
      <Button
        label="Try again"
        variant="text"
        icon="refresh"
        onPress={() => {
          void resend(request);
        }}
      />
    </View>
  );
}

export function RequestStatus({ request }: { readonly request: AssistantMessageRow }): ReactNode {
  if (request.state === 'failed') {
    return <Failed request={request} />;
  }
  const live = request.state !== 'answered';
  return (
    <View className="gap-1">
      <WorkSummary steps={stepsOf(request.steps, live)} live={live} />
      {live ? <TypingDots tone="primary" /> : null}
    </View>
  );
}
