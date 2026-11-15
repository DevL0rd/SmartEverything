import type { PlannerGuestResponse } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { IconButton } from '../../../components/icon-button';
import { OverflowButton, type MenuItem } from '../../../components/menu';
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
      <View className="min-w-0 flex-row items-center gap-2">
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {view.name}
        </Text>
        <View className="shrink-0">
          <ResponseBadge response={view.row.response} />
        </View>
      </View>
      {view.detail === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {view.detail}
        </Text>
      )}
      {delivery === null ? null : (
        <Text variant="caption" tone={delivery.tone} numberOfLines={2}>
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

function menuOf(
  view: GuestView,
  disabled: boolean,
  onResend: GuestRowProps['onResend'],
  onCopyLink: GuestRowProps['onCopyLink'],
): readonly MenuItem[] {
  return [
    ...(onResend === null || !canResend(view.row)
      ? []
      : [
          {
            label: 'Send again',
            icon: 'refresh' as const,
            disabled,
            onPress: (): void => {
              onResend(view);
            },
          },
        ]),
    ...(onCopyLink === null || view.row.kind !== 'email'
      ? []
      : [
          {
            label: 'Copy invite link',
            icon: 'link' as const,
            disabled,
            onPress: (): void => {
              onCopyLink(view);
            },
          },
        ]),
  ];
}

function Row({ view, disabled, onRemove, onResend, onCopyLink }: GuestRowProps): ReactNode {
  const items = menuOf(view, disabled, onResend, onCopyLink);
  return (
    <View className="min-h-row-h flex-row items-center gap-3 py-2 pl-4 pr-2">
      <PersonBadge profile={view.profile} name={view.name} />
      <GuestLines view={view} />
      {items.length === 0 ? null : <OverflowButton items={items} label={`More for ${view.name}`} />}
      {onRemove === null ? null : (
        <IconButton
          icon="x"
          label={`Remove ${view.name}`}
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
