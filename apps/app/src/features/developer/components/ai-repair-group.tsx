import type { ReactNode } from 'react';
import type { AiRepairGroup } from '@smarteverything/domain';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { clock, shortDate } from '../../../format/time';
import type { RepairDiagnosisAction } from '../data/ai-repair-inbox';
import {
  canDiagnose,
  diagnosisChat,
  diagnosisStatus,
  errorTitle,
  isInvestigationActive,
} from '../model/ai-repair-copy';

interface DiagnosisActionState {
  readonly chatId: string | null;
  readonly status: string | undefined;
  readonly retry: boolean;
  readonly available: boolean;
}

function diagnosisActionState(
  group: AiRepairGroup,
  { pending, failed }: RepairDiagnosisAction,
): DiagnosisActionState {
  const recovering = failed || pending;
  return {
    chatId: recovering ? null : diagnosisChat(group),
    status: diagnosisStatus(group, failed),
    retry: failed || group.progress === 'failed' || (pending && isInvestigationActive(group)),
    available: recovering || canDiagnose(group),
  };
}

function DiagnosisActions({
  group,
  diagnosis,
}: {
  readonly group: AiRepairGroup;
  readonly diagnosis: RepairDiagnosisAction;
}): ReactNode {
  const { diagnose, pending } = diagnosis;
  const { chatId, status, retry, available } = diagnosisActionState(group, diagnosis);
  return (
    <View className="gap-1">
      {status === undefined ? null : (
        <Text
          variant="footnote"
          tone={retry ? 'warning' : 'variant'}
          accessibilityLiveRegion="polite"
        >
          {status}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-1">
        {chatId === null ? null : (
          <Button label="Open investigation" variant="text" href={href.assistantChat(chatId)} />
        )}
        {available ? (
          <Button
            label={retry ? 'Retry investigation' : 'Investigate with AI'}
            variant={chatId === null ? 'tonal' : 'text'}
            loading={pending}
            onPress={diagnose}
          />
        ) : null}
      </View>
    </View>
  );
}

export function AiRepairErrorGroup({
  group,
  diagnosis,
  dismissing,
  onDismiss,
}: {
  readonly group: AiRepairGroup;
  readonly diagnosis: RepairDiagnosisAction;
  readonly dismissing: boolean;
  readonly onDismiss: () => void;
}): ReactNode {
  const title = errorTitle(group.event);
  const label = group.observations === 1 ? 'occurrence' : 'occurrences';
  return (
    <View className="gap-1 px-4 py-2">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">{title}</Text>
          <Text variant="footnote" tone="variant">
            {`${group.component} · ${String(group.observations)} ${label} · ${shortDate(group.lastAt)} ${clock(group.lastAt)}`}
          </Text>
        </View>
        {isInvestigationActive(group) ? null : (
          <IconButton
            icon="close"
            label={`Dismiss ${title}`}
            disabled={dismissing || diagnosis.pending}
            onPress={onDismiss}
          />
        )}
      </View>
      {group.latestLogId === null ? (
        <Text variant="footnote" tone="variant">
          The error details have expired.
        </Text>
      ) : null}
      <DiagnosisActions group={group} diagnosis={diagnosis} />
    </View>
  );
}
