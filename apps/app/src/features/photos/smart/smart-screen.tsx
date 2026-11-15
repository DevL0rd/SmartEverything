import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoAiStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner, type BannerProps } from '../../../components/banner';
import { ErrorState } from '../../../components/error-state';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { isNative } from '../../../design/platform';
import { count } from '../../../format/number';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { retryFailedPhotoAi } from './api';
import { failedTotalOf, smartPhaseOf, type SmartPhase } from './model';
import { OwnerCard } from './owner-card';
import { PHOTOS_SMART_PAGE } from './page';
import { ProgressCard } from './progress-card';
import { useAiStatusStore, usePhotoAiStatus } from './queries';
import { SwitchesCard } from './switches-card';

const AI_SETTINGS_HREF = href.settings.page('assistant');

const OPEN_PEOPLE: readonly HeaderAction[] = [
  { icon: 'users', label: 'Open People and pets', href: href.photosPage('people') },
];

interface PhaseInput {
  readonly status: PhotoAiStatus;
  readonly owner: boolean;
  readonly retry: { readonly busy: boolean; readonly live: boolean; readonly run: () => void };
}

type PhaseBannerProps = Pick<BannerProps, 'tone' | 'title' | 'body' | 'action'>;

const NO_KEY_BANNER: PhaseBannerProps = {
  tone: 'warning',
  title: 'Add an OpenRouter key',
  body: 'Tags, text search and search by meaning wait for a key in AI settings. Face grouping keeps running.',
  action: { label: 'Open AI settings', variant: 'tonal', href: AI_SETTINGS_HREF },
};

function retryActionOf(retry: PhaseInput['retry']): NonNullable<BannerProps['action']> {
  return {
    label: 'Retry failed',
    icon: 'refresh',
    variant: 'filled',
    loading: retry.busy,
    onPress: retry.run,
  };
}

export function phaseBannerOf(phase: SmartPhase, input: PhaseInput): PhaseBannerProps | null {
  if (phase === 'no-key') return NO_KEY_BANNER;
  if (phase === 'failed') {
    return {
      tone: 'critical',
      title: `${count(failedTotalOf(input.status))} could not be analysed`,
      body: input.retry.live
        ? 'Retry failed runs only these photos again.'
        : 'Retry failed comes back when your home hub answers.',
      ...(input.retry.live ? { action: retryActionOf(input.retry) } : {}),
    };
  }
  if (phase === 'off') {
    return {
      tone: 'info',
      title: 'Smart features are off',
      body: input.owner
        ? 'Turn on a switch to start.'
        : 'Your photos stay unanalysed until you turn a switch on.',
    };
  }
  return null;
}

function PhaseBanner({ phase, ...input }: PhaseInput & { readonly phase: SmartPhase }): ReactNode {
  const banner = phaseBannerOf(phase, input);
  return banner === null ? null : <Banner {...banner} wrapBody />;
}

function useRetryFailed(live: boolean): PhaseInput['retry'] {
  const mutation = useMutationState();
  const store = useAiStatusStore();
  return {
    busy: mutation.busy,
    live,
    run: (): void => {
      mutation.run(retryFailedPhotoAi, {
        failure: 'The failed photos were not retried',
        label: 'photos.smart.retry_failed',
        onDone: store,
      });
    },
  };
}

function Body({
  status,
  live,
}: {
  readonly status: PhotoAiStatus;
  readonly live: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const retry = useRetryFailed(live);
  return (
    <View className="gap-section-gap large:flex-row large:items-start">
      <View className="min-w-0 gap-section-gap large:flex-1">
        <PhaseBanner phase={smartPhaseOf(status)} status={status} owner={owner} retry={retry} />
        <SwitchesCard status={status} live={live} />
        <ProgressCard status={status} />
      </View>
      {owner ? (
        <View className="min-w-0 large:flex-1">
          <OwnerCard status={status} live={live} />
        </View>
      ) : null}
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy className="gap-section-gap">
      <Skeleton shape="block" className="h-40 w-full" />
      <Skeleton shape="block" className="h-32 w-full" />
    </View>
  );
}

export function SmartFeaturesScreen(): ReactNode {
  const query = usePhotoAiStatus();
  const live = useSyncStatus().status === 'live';
  const status = query.data;
  return (
    <SettingsFrame
      page={PHOTOS_SMART_PAGE}
      actions={OPEN_PEOPLE}
      contentWidth={isNative() ? 'reading' : 'full'}
      {...(live
        ? {}
        : {
            banner: (
              <Banner
                tone="info"
                title="Offline · showing the last snapshot"
                body="Switches and progress come back when your home hub answers."
                wrapBody
              />
            ),
          })}
    >
      {status !== undefined ? <Body status={status} live={live} /> : null}
      {status === undefined && query.isError ? (
        <ErrorState
          error={query.error}
          page
          retry={() => {
            background(query.refetch(), 'photos.smart.refetch_failed');
          }}
        />
      ) : null}
      {status === undefined && !query.isError ? <Loading /> : null}
    </SettingsFrame>
  );
}
