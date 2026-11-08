import type { ReactNode, Ref } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { UpdateProgress } from '../../../components/update-progress';
import type { OfferAction, OfferTone, ReleaseOffer } from '../model/release-offer';
import { offerIcon } from './offer-notice';

const STATUS_ICON: Readonly<Record<OfferTone, IconName>> = {
  info: 'info',
  positive: 'circleCheck',
  warning: 'warning',
  critical: 'alert',
};

function ReleaseNotes({ offer }: { readonly offer: ReleaseOffer }): ReactNode {
  if (offer.meta === null && offer.notes === undefined) return null;
  return (
    <View className="gap-1 rounded-md bg-surface-2 p-3">
      {offer.meta === null ? null : (
        <Text variant="label" tone="variant">
          {offer.meta}
        </Text>
      )}
      {offer.notes === undefined ? null : (
        <Text variant="callout" selectable className="min-w-0 web:wrap-anywhere">
          {offer.notes}
        </Text>
      )}
    </View>
  );
}

export function OfferBlock({
  offer,
  children,
}: {
  readonly offer: ReleaseOffer;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Icon name={STATUS_ICON[offer.tone]} size={20} tone={offer.tone} />
          <Text variant="title-3" className="flex-1" accessibilityLiveRegion="polite">
            {offer.title}
          </Text>
        </View>
        {offer.sentence === null ? null : (
          <Text variant="callout" tone="variant">
            {offer.sentence}
          </Text>
        )}
      </View>
      {offer.progress === null ? null : <UpdateProgress progress={offer.progress} />}
      <ReleaseNotes offer={offer} />
      {children}
    </View>
  );
}

export function OfferButton({
  action,
  onPress,
  buttonRef,
}: {
  readonly action: OfferAction;
  readonly onPress: (() => void) | undefined;
  readonly buttonRef?: Ref<View>;
}): ReactNode {
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      label={action.label}
      variant={action.kind === 'cancel' ? 'outlined' : 'filled'}
      icon={offerIcon(action)}
      loading={action.busy}
      disabled={onPress === undefined && !action.busy}
      {...(onPress === undefined ? {} : { onPress })}
    />
  );
}
