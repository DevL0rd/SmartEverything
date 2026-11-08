import type { ReactNode, Ref, RefObject } from 'react';
import type { View } from 'react-native';
import { useConnection } from '../../../api/transport';
import type { BannerProps } from '../../../components/banner';
import type { IconName } from '../../../components/icon';
import { UpdateNotice, type UpdateNoticeProps } from '../../../components/update-notice';
import { UpdateProgress } from '../../../components/update-progress';
import type { UpdateDetailsOffer } from '../../../components/use-update-details';
import { offerBody, type OfferAction, type ReleaseOffer } from '../model/release-offer';

export type BannerButton = NonNullable<BannerProps['action']>;

const ICONS: Readonly<Record<OfferAction['kind'], IconName>> = {
  update: 'download',
  restart: 'refresh',
  retry: 'refresh',
  check: 'refresh',
  cancel: 'close',
};

export function offerIcon(action: OfferAction): IconName {
  return ICONS[action.kind];
}

export function isPrimaryAction(action: OfferAction): boolean {
  return action.kind === 'update' || action.kind === 'restart';
}

export function offerButton(
  action: OfferAction | null,
  onPress: (() => void) | undefined,
): BannerButton | undefined {
  if (action === null || onPress === undefined) return undefined;
  return {
    label: action.label,
    onPress,
    ...(isPrimaryAction(action) ? { variant: 'outlined' } : {}),
    ...(action.busy ? { loading: true } : {}),
  };
}

export function offerDetailsFooter(
  offer: ReleaseOffer,
  onPress: ((opener: RefObject<View | null>) => void) | undefined,
): UpdateDetailsOffer['footer'] {
  const { action } = offer;
  if (action !== null && !action.busy && onPress !== undefined && action.kind !== 'cancel') {
    return {
      kind: 'action',
      actionId: action.kind,
      label: action.label,
      icon: offerIcon(action),
      onPress,
    };
  }
  if (offer.progress !== null)
    return { kind: 'status', label: offer.title, progress: offer.progress };
  return { kind: 'status', label: offer.sentence ?? offer.title };
}

function noticeText(offer: ReleaseOffer): Pick<UpdateNoticeProps, 'body' | 'brief' | 'wrapBody'> {
  const moving = offer.progress !== null;
  const body = moving ? (offer.meta ?? undefined) : offerBody(offer);
  return {
    brief: offer.sentence === null && !moving ? offer.brief : undefined,
    wrapBody: offer.sentence !== null,
    ...(body === undefined ? {} : { body }),
  };
}

export function OfferNotice({
  offer,
  action,
  actionRef,
  secondaryAction,
  onDismiss,
}: {
  readonly offer: ReleaseOffer;
  readonly action: BannerButton | undefined;
  readonly actionRef: Ref<View>;
  readonly secondaryAction: BannerProps['secondaryAction'];
  readonly onDismiss: (() => void) | undefined;
}): ReactNode {
  return (
    <UpdateNotice
      tone={offer.tone}
      title={offer.title}
      announceTitle
      {...noticeText(offer)}
      {...(action === undefined ? {} : { action: { ...action, ref: actionRef } })}
      {...(secondaryAction === undefined ? {} : { secondaryAction })}
      {...(offer.dismissible && onDismiss !== undefined ? { onDismiss } : {})}
    >
      {offer.progress === null ? undefined : <UpdateProgress progress={offer.progress} />}
    </UpdateNotice>
  );
}

export function useShellScope(): unknown {
  const connection = useConnection();
  return connection.status === 'paired' ? connection.connection : connection.status;
}
