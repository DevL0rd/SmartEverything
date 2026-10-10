import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { McpApprovalCode } from '@smarteverything/domain';
import { createApprovalCode } from '../../../api/access';
import { Button } from '../../../components/button';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';

function Shown({ code }: { readonly code: McpApprovalCode }): ReactNode {
  const expired = Date.parse(code.expiresAt) <= useMinute();
  return (
    <View className="items-center gap-1 rounded-lg bg-surface-2 p-card-pad">
      <Figure value={expired ? '––––––' : code.code} size="l" />
      <Text variant="footnote" tone="variant">
        {expired ? 'Expired. Show a new code.' : `Works once, until ${clock(code.expiresAt)}`}
      </Text>
    </View>
  );
}

export function ApprovalCode(): ReactNode {
  const [code, setCode] = useState<McpApprovalCode | null>(null);
  const mutation = useMutationState();
  const show = (): void => {
    mutation.run(createApprovalCode, { failure: 'No code right now', onDone: setCode });
  };
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant">
        Type this code on the sign-in page your assistant opened.
      </Text>
      {code === null ? null : <Shown code={code} />}
      <Button
        label={code === null ? 'Show a code' : 'Show a new code'}
        variant="tonal"
        icon="key"
        loading={mutation.busy}
        onPress={show}
      />
    </View>
  );
}
