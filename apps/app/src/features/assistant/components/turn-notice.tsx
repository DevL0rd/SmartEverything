import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useRow } from '../../../store/selectors';
import { useRetryFrom } from '../data/retry';
import { retryMessage } from '../data/send';
import { noticeOf, type NoticeSubject } from '../model/turn-notice';

export function TurnNotice({
  row,
  subject,
}: {
  readonly row: AssistantMessageRow;
  readonly subject: NoticeSubject;
}): ReactNode {
  const replyTo = useRow('assistant_messages', subject === 'reply' ? row.reply_to : null);
  const request = subject === 'request' ? row : replyTo;
  const from = useRetryFrom(request);
  const spec = noticeOf(row.reason_code, row.reason, subject);
  return (
    <View className="flex-row flex-wrap items-center gap-x-2" accessibilityRole="alert">
      <Text variant="footnote" tone={spec.tone === 'critical' ? 'critical' : 'variant'}>
        {spec.title}
      </Text>
      {request === null || from === null ? null : (
        <Button
          label={row.reason_code === 'stopped' ? 'Regenerate' : 'Try again'}
          icon="refresh"
          variant="text"
          onPress={(): void => {
            void retryMessage(request, from);
          }}
        />
      )}
    </View>
  );
}
