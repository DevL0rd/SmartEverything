import type { ComponentProps, ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { View } from 'react-native';
import { UpdateDetails, type UpdateDetailsFooter } from './update-details';
import { useUpdateDetailsFallback } from './update-details-focus';

type ModalProps = ComponentProps<typeof UpdateDetails>;

type DetailsAction = Omit<Extract<UpdateDetailsFooter, { readonly kind: 'action' }>, 'onPress'> & {
  readonly actionId: string;
  readonly onPress: (opener: RefObject<View | null>) => void;
};

interface OfferIdentity {
  readonly id: string;
  readonly scope: unknown;
}

interface ActionIntent extends OfferIdentity {
  readonly actionId: string;
}

interface DetailsSnapshot extends OfferIdentity {
  readonly content: Pick<ModalProps, 'title' | 'target' | 'metadata' | 'notes' | 'reviewSource'>;
}

export interface UpdateDetailsOffer extends DetailsSnapshot {
  readonly releaseNotesContent?: ModalProps['releaseNotesContent'];
  readonly footer: Exclude<UpdateDetailsFooter, { readonly kind: 'action' }> | DetailsAction;
  readonly status?: ModalProps['status'];
}

interface DetailsTrigger {
  readonly label: string;
  readonly spoken: string;
  readonly ref: RefObject<View | null>;
  readonly onPress: () => void;
}

interface DetailsLauncher {
  readonly secondaryAction: DetailsTrigger | undefined;
  readonly modal: ReactNode;
}

function isSameOffer(offer: OfferIdentity | null, snapshot: OfferIdentity | null): boolean {
  return (
    offer !== null &&
    snapshot !== null &&
    offer.id === snapshot.id &&
    offer.scope === snapshot.scope
  );
}

function useApplyAfterClose(
  open: boolean,
  offer: UpdateDetailsOffer | null,
  close: () => void,
  opener: RefObject<View | null>,
): (intent: ActionIntent) => void {
  const pending = useRef<ActionIntent | null>(null);
  const apply = useEffectEvent(() => {
    const intent = pending.current;
    pending.current = null;
    if (
      intent !== null &&
      offer?.footer.kind === 'action' &&
      isSameOffer(offer, intent) &&
      offer.footer.actionId === intent.actionId
    ) {
      offer.footer.onPress(opener);
    }
  });
  useEffect(() => {
    if (!open) apply();
  }, [open]);
  return (intent): void => {
    pending.current = intent;
    close();
  };
}

function footerOf(
  offer: UpdateDetailsOffer | null,
  apply: (intent: ActionIntent) => void,
): UpdateDetailsFooter {
  if (offer === null) return { kind: 'stale' };
  const { footer, id, scope } = offer;
  if (footer.kind !== 'action') return footer;
  return {
    ...footer,
    onPress: (): void => {
      apply({ id, scope, actionId: footer.actionId });
    },
  };
}

export function useUpdateDetails(
  offer: UpdateDetailsOffer | null,
  fallbackFocus?: RefObject<View | null>,
  suspended = false,
): DetailsLauncher {
  const [snapshot, setSnapshot] = useState<DetailsSnapshot | null>(null);
  const opener = useRef<View>(null);
  const fallback = useUpdateDetailsFallback(fallbackFocus);
  const close = (): void => {
    setSnapshot(null);
  };
  const applyAfterClose = useApplyAfterClose(
    snapshot !== null,
    suspended ? null : offer,
    close,
    opener,
  );
  const active = isSameOffer(offer, snapshot) ? offer : null;
  const footer = footerOf(active, applyAfterClose);
  return {
    secondaryAction:
      !suspended && offer?.footer.kind === 'action'
        ? {
            label: 'Details',
            spoken: `Details for ${offer.content.target ?? offer.content.title}`,
            ref: opener,
            onPress: (): void => {
              setSnapshot({ id: offer.id, scope: offer.scope, content: offer.content });
            },
          }
        : undefined,
    modal:
      snapshot === null || suspended ? null : (
        <UpdateDetails
          {...snapshot.content}
          releaseNotesContent={active?.releaseNotesContent}
          footer={footer}
          status={active?.status}
          onClose={close}
          opener={opener}
          fallbackFocus={fallback}
        />
      ),
  };
}
