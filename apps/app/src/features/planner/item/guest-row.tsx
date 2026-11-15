import type { PlannerGuestResponse } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { RESPONSE_TEXT, canResend, deliveryOf, type GuestView } from './guests-model';
import { PersonBadge } from './person-badge';

const RESPONSE_TONE: Readonly<Record<PlannerGuestResponse, BadgeTone>> = {
  yes: 'positive',
  maybe: 'warning',
  no: 'critical',
  needs_action: 'neutral',
};

export function ResponseBadge({
  response,
}: {
  readonly response: PlannerGuestResponse;
}): ReactNode {
  return <Badge label={RESPONSE_TEXT[response]} tone={RESPONSE_TONE[response]} />;
}

export interface GuestRowProps {
  readonly view: GuestView;
  readonly disabled: boolean;
  readonly onRemove: ((view: GuestView) => void) | null;
  readonly onResend: ((view: GuestView) => void) | null;
  readonly onCopyLink: ((view: GuestView) => void) | null;
}

function GuestLines({ view }: { readonly view: GuestView }): ReactNode {
  const delivery = deliveryOf(view.row);
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {view.name}
        </Text>
        <ResponseBadge response={view.row.response} />
      </View>
      {view.detail === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {view.detail}
        </Text>
      )}
      {delivery === null ? null : (
        <Text variant="caption" tone={delivery.tone}>
          {delivery.text}
        </Text>
      )}
      {view.row.note === null ? null : (
        <Text variant="caption" tone="variant">
          {`“${view.row.note}”`}
        </Text>
      )}
    </View>
  );
}

function Row({ view, disabled, onRemove, onResend, onCopyLink }: GuestRowProps): ReactNode {
  return (
    <View className="min-h-12 flex-row items-center gap-3 px-4 py-1.5">
      <PersonBadge profile={view.profile} name={view.name} />
      <GuestLines view={view} />
      {onResend === null || !canResend(view.row) ? null : (
        <IconButton
          icon="refresh"
          label={`Send the invitation to ${view.name} again`}
          size="control"
          disabled={disabled}
          onPress={() => {
            onResend(view);
          }}
        />
      )}
      {onCopyLink === null || view.row.kind !== 'email' ? null : (
        <IconButton
          icon="link"
          label={`Copy the invite link of ${view.name}`}
          size="control"
          disabled={disabled}
          onPress={() => {
            onCopyLink(view);
          }}
        />
      )}
      {onRemove === null ? null : (
        <IconButton
          icon="x"
          label={`Remove ${view.name}`}
          size="control"
          disabled={disabled}
          onPress={() => {
            onRemove(view);
          }}
        />
      )}
    </View>
  );
}

export const GuestRow = memo(Row);
