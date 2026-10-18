import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { NavRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { rawErrorText } from '../../../format/errors';
import type { useNativeStart } from '../data/native-start';

export function ClaudeCliStartFeedback({
  start,
}: {
  readonly start: ReturnType<typeof useNativeStart>;
}): ReactNode {
  const submission = start.submission;
  if (submission === null) return null;
  const receipt = submission.state === 'received' ? submission.receipt : null;
  const reason = submission.state === 'received' ? submission.receipt.reason : submission.reason;
  const accepted = receipt?.state === 'accepted';
  return (
    <View className="gap-2">
      <Text tone={submission.state === 'rejected' ? 'critical' : 'variant'}>
        {submissionLabel(submission)}
      </Text>
      <Text variant="footnote" tone="variant" selectable>
        Operation {submissionId(submission)}
      </Text>
      {reason === null ? null : <Text tone="critical">{reason}</Text>}
      {receipt === null ? null : (
        <NavRow title="Open shared chat" href={href.assistantChat(receipt.chat_id)} />
      )}
      <ReceiptActions start={start} accepted={accepted} />
      {start.checkError === null ? null : (
        <Text tone="critical">{rawErrorText(start.checkError)}</Text>
      )}
    </View>
  );
}

function submissionLabel(
  submission: NonNullable<ReturnType<typeof useNativeStart>['submission']>,
): string {
  if (submission.state === 'received' && submission.receipt.state === 'accepted')
    return 'Session started. Open the chat to follow it.';
  if (submission.state === 'rejected') return 'Couldn’t start the session.';
  return 'Couldn’t confirm it started. Check status before starting another.';
}

function ReceiptActions({
  start,
  accepted,
}: {
  readonly start: ReturnType<typeof useNativeStart>;
  readonly accepted: boolean;
}): ReactNode {
  return (
    <>
      {start.submission?.state === 'rejected' ? null : (
        <Button
          label="Check status"
          variant="tonal"
          loading={start.checking}
          onPress={start.check}
        />
      )}
      {accepted ? (
        <Button label="Start another session" variant="text" onPress={start.clear} />
      ) : null}
    </>
  );
}

function submissionId(
  submission: NonNullable<ReturnType<typeof useNativeStart>['submission']>,
): string {
  return submission.state === 'received' ? submission.receipt.operation_id : submission.operationId;
}
