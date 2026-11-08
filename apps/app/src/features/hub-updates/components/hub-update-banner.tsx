import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { HubUpdateSourceCheck, HubUpdateSourceStart } from '@smarteverything/domain';
import type { View } from 'react-native';
import { useConnection } from '../../../api/transport';
import { href, UPDATES_SETTINGS_PAGE } from '../../../app-shell/hrefs';
import type { BannerProps } from '../../../components/banner';
import { focusView, useFocusRequest } from '../../../components/focus-request';
import { UpdateNotice, type UpdateNoticeProps } from '../../../components/update-notice';
import { useUpdateDetails, type UpdateDetailsOffer } from '../../../components/use-update-details';
import { useForeground } from '../../../design/animation-gate';
import { releaseNotesOf } from '../../../format/release-notes';
import { useIsOwner, useSession, useSyncStatus } from '../../../store/selectors';
import {
  useHubUpdateSource,
  useHubUpdateStarting,
  useHubUpdateStatus,
  useStartHubUpdateSource,
} from '../data/update-queries';
import { useReleaseNotice } from '../data/release-notice';
import {
  sourceBlockedReason,
  sourceReleaseRequest,
  SOURCE_START_REFUSAL,
  type ReleaseNotice,
} from '../model/update-copy';

const REVIEW = { label: 'Review', href: href.settings.page(UPDATES_SETTINGS_PAGE) } as const;
const UPDATE_TITLE = 'Hub update available';

type Start = ReturnType<typeof useStartHubUpdateSource>;
type SourceCheck = ReturnType<typeof useHubUpdateSource>;
type Action = NonNullable<BannerProps['action']>;
type DetailsAction = Extract<UpdateDetailsOffer['footer'], { readonly kind: 'action' }>;

interface SourceOffer {
  readonly id: string;
  readonly branch: string;
  readonly notes: string | undefined;
  readonly request: HubUpdateSourceStart;
}

function startProblem(start: Start, offerId: string): string | null {
  if (start.variables?.offerId !== offerId) return null;
  if (start.data?.status === 'refused') return SOURCE_START_REFUSAL[start.data.refusal];
  return start.isError
    ? 'Couldn’t confirm that the release started. Review the latest release.'
    : null;
}

function sourceOfferOf(source: HubUpdateSourceCheck | null): SourceOffer | null {
  if (source?.offerId === undefined) return null;
  const request = sourceReleaseRequest(source, source.offerId);
  return {
    id: `${source.tip}:${source.offerId}:${String(request.includePending)}`,
    branch: `${source.remote} / ${source.branch}`,
    notes: source.notes,
    request,
  };
}

function SourceOfferConfirmation({
  offer,
  onCancel,
  onConfirm,
}: {
  readonly offer: SourceOffer;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): ReactNode {
  const cancelButton = useFocusRequest(true);
  return (
    <UpdateNotice
      tone="info"
      title="Release the Git update?"
      body={
        offer.request.includePending
          ? `${offer.branch} · Includes your pending changes. The hub may restart.`
          : `${offer.branch} · The hub may restart.`
      }
      wrapBody
      announceTitle
      action={{ label: 'Release update', variant: 'outlined', onPress: onConfirm }}
      secondaryAction={{ label: 'Cancel', ref: cancelButton, onPress: onCancel }}
    />
  );
}

interface Approval {
  readonly offer: SourceOffer;
  readonly restoreFocus: RefObject<View | null>;
}

function useSourceApproval(
  offer: SourceOffer | null,
  start: Start,
): {
  readonly action: { readonly banner: Action; readonly details: DetailsAction } | undefined;
  readonly confirmation: ReactNode;
  readonly opener: RefObject<View | null>;
} {
  const [approval, setApproval] = useState<Approval | null>(null);
  const opener = useRef<View>(null);
  const current = approval?.offer.id === offer?.id ? approval : null;
  if (approval !== current) setApproval(current);
  const label = 'Update';
  const begin = (restoreFocus: RefObject<View | null>): void => {
    if (offer !== null) setApproval({ offer, restoreFocus });
  };
  return {
    opener,
    action:
      offer === null
        ? undefined
        : {
            banner: {
              label,
              variant: 'outlined',
              ref: opener,
              onPress: (): void => {
                begin(opener);
              },
            },
            details: { kind: 'action', actionId: offer.id, label, onPress: begin },
          },
    confirmation:
      current === null ? null : (
        <SourceOfferConfirmation
          offer={current.offer}
          onConfirm={(): void => {
            setApproval(null);
            start.mutate(current.offer.request);
          }}
          onCancel={(): void => {
            setApproval(null);
            requestAnimationFrame(() => {
              if (!focusView(current.restoreFocus.current)) focusView(opener.current);
            });
          }}
        />
      ),
  };
}

function sourceCheckStatus(check: SourceCheck): string | null {
  if (check.isError) return 'Couldn’t check the latest Git source.';
  if (check.isFetching) return 'Checking the latest Git source…';
  return null;
}

function visibleSource(
  source: HubUpdateSourceCheck | undefined,
  live: boolean,
  dismissedTip: string | null,
): HubUpdateSourceCheck | null {
  if (!live || source === undefined || source.tip === dismissedTip) return null;
  return source.offerId === undefined && source.availableUpdate === undefined ? null : source;
}

function sourceDetailsOf({
  offer,
  ownerId,
  action,
  problem,
  unavailable,
}: {
  readonly offer: SourceOffer | null;
  readonly ownerId: string;
  readonly action: DetailsAction | undefined;
  readonly problem: string | null;
  readonly unavailable: string | null;
}): UpdateDetailsOffer | null {
  if (offer === null) return null;
  return {
    id: offer.id,
    scope: ownerId,
    content: {
      title: 'Hub update',
      metadata: [`Git source · ${offer.branch}`],
      ...(offer.notes === undefined ? {} : { notes: offer.notes }),
      reviewSource: REVIEW.href,
    },
    footer:
      unavailable === null ? (action ?? { kind: 'stale' }) : { kind: 'status', label: unavailable },
    ...(problem === null ? {} : { status: { label: problem, tone: 'warning' } }),
  };
}

interface SourceUpdateNoticeProps {
  readonly onDismiss: (() => void) | undefined;
  readonly notice: ReleaseNotice | null;
  readonly check: SourceCheck;
  readonly live: boolean;
  readonly start: Start;
  readonly ownerId: string;
}

function SourceUpdateNotice({
  check,
  live,
  start,
  notice,
  ownerId,
  onDismiss,
}: SourceUpdateNoticeProps): ReactNode {
  const [dismissedTip, setDismissedTip] = useState<string | null>(null);
  const source = visibleSource(check.data, live, dismissedTip);
  const offer = sourceOfferOf(source);
  const unavailable = notice?.title ?? sourceCheckStatus(check);
  const { action, confirmation, opener } = useSourceApproval(
    unavailable === null ? offer : null,
    start,
  );
  const problem = offer === null ? null : startProblem(start, offer.request.offerId);
  const details = useUpdateDetails(
    sourceDetailsOf({ offer, ownerId, action: action?.details, problem, unavailable }),
    opener,
    confirmation !== null,
  );
  const review = { ...REVIEW, ref: opener };
  if (confirmation !== null) return confirmation;
  return (
    <>
      {notice === null ? (
        <SourceAvailableNotice
          source={source}
          check={check}
          offer={offer}
          action={action?.banner}
          review={review}
          details={details.secondaryAction}
          problem={problem}
          onDismissTip={setDismissedTip}
        />
      ) : (
        <UpdateNotice
          {...notice}
          announceTitle
          action={review}
          {...(onDismiss === undefined ? {} : { onDismiss })}
        />
      )}
      {details.modal}
    </>
  );
}

function SourceAvailableNotice({
  source,
  check,
  offer,
  action,
  review,
  details,
  problem,
  onDismissTip,
}: {
  readonly source: HubUpdateSourceCheck | null;
  readonly check: SourceCheck;
  readonly offer: SourceOffer | null;
  readonly action: Action | undefined;
  readonly review: Action;
  readonly details: Action | undefined;
  readonly problem: string | null;
  readonly onDismissTip: (tip: string) => void;
}): ReactNode {
  if (source === null) return null;
  const copy =
    offer === null || action === undefined
      ? sourceReviewCopy(source, check)
      : sourceOfferCopy(offer, problem);
  return (
    <UpdateNotice
      {...copy}
      title={UPDATE_TITLE}
      announceTitle
      action={action ?? review}
      {...(details === undefined ? {} : { secondaryAction: details })}
      onDismiss={(): void => {
        onDismissTip(source.tip);
      }}
    />
  );
}

type NoticeCopy = Required<Pick<UpdateNoticeProps, 'body' | 'tone' | 'wrapBody'>> &
  Pick<UpdateNoticeProps, 'brief'>;

function sourceReviewCopy(source: HubUpdateSourceCheck, check: SourceCheck): NoticeCopy {
  const blocked = sourceBlockedReason(source);
  return {
    tone: blocked === null && !check.isError ? 'info' : 'warning',
    body: sourceCheckStatus(check) ?? blocked ?? 'Review the Git source to continue.',
    wrapBody: true,
  };
}

function sourceOfferCopy(offer: SourceOffer, problem: string | null): NoticeCopy {
  const brief = releaseNotesOf(offer.notes)?.brief;
  return {
    tone: problem === null ? 'info' : 'warning',
    body: problem ?? (brief === undefined ? `${offer.branch} · New Git commits` : offer.branch),
    brief: problem === null ? brief : undefined,
    wrapBody: problem !== null,
  };
}

function OwnerUpdateBanner({
  ownerId,
  home,
}: {
  readonly ownerId: string;
  readonly home: string;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const foreground = useForeground();
  const active = live && foreground;
  const check = useHubUpdateSource(active);
  const status = useHubUpdateStatus(active);
  const start = useStartHubUpdateSource();
  const starting = useHubUpdateStarting();
  const { notice, onDismiss } = useReleaseNotice({
    home,
    release: status.data?.release,
    starting,
    live,
    foreground,
  });
  return (
    <SourceUpdateNotice
      check={check}
      live={live}
      start={start}
      notice={notice}
      ownerId={ownerId}
      onDismiss={onDismiss}
    />
  );
}

export function HubUpdateBanner(): ReactNode {
  return useIsOwner() ? <PairedOwnerUpdateBanner /> : null;
}

function PairedOwnerUpdateBanner(): ReactNode {
  const ownerId = useSession().client.id;
  const connection = useConnection();
  if (connection.status !== 'paired') return null;
  const home = connection.connection.trustedMetadata?.identity.id ?? connection.connection.url;
  return <OwnerUpdateBanner key={`${home}:${ownerId}`} ownerId={ownerId} home={home} />;
}
