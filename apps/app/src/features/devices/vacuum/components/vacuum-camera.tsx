import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../../app-shell/hrefs';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Text } from '../../../../components/text';
import { useSettings } from '../../../../store/selectors';
import { VideoSurface } from '../../../cameras';
import { useVacuumVideo, type VacuumVideo } from '../data/use-vacuum-video';
import {
  ACTION_LABELS,
  LIVE_PRIVACY,
  isCardPhase,
  videoCard,
  type VideoAction,
  type VideoCard,
} from '../model/video-copy';
import { VideoPasswordDialog } from './video-password';

export interface VacuumCameraProps {
  readonly deviceId: string;
  readonly active: boolean;
  readonly compact: boolean;
  readonly onClose: () => void;
}

const CARD_TONE = { neutral: 'variant', warning: 'warning', critical: 'critical' } as const;

function ActionButton({
  action,
  video,
  primary,
}: {
  readonly action: VideoAction;
  readonly video: VacuumVideo;
  readonly primary: boolean;
}): ReactNode {
  const variant = primary ? 'filled' : 'tonal';
  if (action === 'firewall') {
    return (
      <Button
        label={ACTION_LABELS.firewall}
        icon="shield"
        variant={variant}
        href={href.settings.page('server/firewall')}
      />
    );
  }
  return (
    <Button
      label={ACTION_LABELS[action]}
      icon={action === 'open' ? 'camera' : 'refresh'}
      variant={variant}
      onPress={video.start}
    />
  );
}

function CompactCard({
  card,
  video,
  onClose,
}: {
  readonly card: VideoCard;
  readonly video: VacuumVideo;
  readonly onClose: () => void;
}): ReactNode {
  const [action] = card.actions;
  return (
    <View
      accessibilityRole={card.tone === 'critical' ? 'alert' : 'summary'}
      className="flex-1 justify-between p-2"
    >
      <View className="flex-row items-start gap-1">
        <View className="min-w-0 flex-1 flex-row items-start gap-1.5 pt-1">
          <Icon name={card.icon} size={16} tone={CARD_TONE[card.tone]} />
          <Text variant="footnote" numberOfLines={3} className="min-w-0 flex-1">
            {card.title}
          </Text>
        </View>
        <IconButton icon="close" label="Back to the map" variant="overlay" onPress={onClose} />
      </View>
      {action === undefined ? null : <ActionButton action={action} video={video} primary />}
    </View>
  );
}

function CardView({
  card,
  video,
}: {
  readonly card: VideoCard;
  readonly video: VacuumVideo;
}): ReactNode {
  return (
    <View
      accessibilityRole={card.tone === 'critical' ? 'alert' : 'summary'}
      className="flex-1 items-center justify-center gap-2 px-4 pb-4 pt-16"
    >
      <View className="max-w-md flex-row items-center gap-2">
        <Icon name={card.icon} size={24} tone={CARD_TONE[card.tone]} />
        <Text variant="body-strong" className="min-w-0 shrink">
          {card.title}
        </Text>
      </View>
      {card.body === null ? null : (
        <Text variant="footnote" tone="variant" className="max-w-md text-center">
          {card.body}
        </Text>
      )}
      <View className="flex-row flex-wrap justify-center gap-2">
        {card.actions.map((action, index) => (
          <ActionButton key={action} action={action} video={video} primary={index === 0} />
        ))}
      </View>
    </View>
  );
}

function LiveBadge({ live }: { readonly live: boolean }): ReactNode {
  return live ? (
    <View
      pointerEvents="none"
      className="absolute left-3 top-3 flex-row items-center gap-2 rounded-full bg-surface-raised/90 px-3 py-2"
    >
      <View className="size-2 rounded-full bg-critical" />
      <Text variant="caption">Live</Text>
    </View>
  ) : (
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      className="absolute inset-0 items-center justify-center gap-2 bg-surface-3/80"
    >
      <Icon name="loader" size={24} tone="variant" />
      <Text variant="footnote" tone="variant">
        {"Connecting to the robot's camera"}
      </Text>
    </View>
  );
}

function LiveChrome({
  video,
  compact,
  onClose,
}: {
  readonly video: VacuumVideo;
  readonly compact: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const live = video.phase.kind === 'live';
  return (
    <>
      <LiveBadge live={live} />
      <View
        pointerEvents="box-none"
        className="absolute inset-x-3 bottom-3 flex-row items-end justify-between gap-2"
      >
        {compact || !live ? (
          <View />
        ) : (
          <View className="min-w-0 shrink rounded-lg bg-surface-raised/90 px-3 py-2">
            <Text variant="caption">{LIVE_PRIVACY}</Text>
          </View>
        )}
        <View className="flex-row gap-2">
          {live ? (
            <IconButton
              icon={video.listening ? 'volume' : 'muted'}
              label={video.listening ? 'Turn the robot sound off' : 'Turn the robot sound on'}
              variant="overlay"
              selected={video.listening}
              onPress={(): void => {
                video.setListening(!video.listening);
              }}
            />
          ) : null}
          <IconButton icon="close" label="Close the camera" variant="overlay" onPress={onClose} />
        </View>
      </View>
    </>
  );
}

function Body({
  video,
  compact,
  onClose,
}: Omit<VacuumCameraProps, 'deviceId' | 'active'> & {
  readonly video: VacuumVideo;
}): ReactNode {
  const zone = useSettings().time_zone;
  const { phase, media } = video;
  if (isCardPhase(phase)) {
    const card = videoCard(phase, zone);
    return compact ? (
      <CompactCard card={card} video={video} onClose={onClose} />
    ) : (
      <CardView card={card} video={video} />
    );
  }
  return (
    <View className="flex-1">
      {media === null ? null : (
        <VideoSurface
          media={media}
          muted={!video.listening}
          onWheel={null}
          fit="contain"
          onFrame={(): void => undefined}
          onSoundBlocked={(): void => {
            video.setListening(false);
          }}
        />
      )}
      <LiveChrome video={video} compact={compact} onClose={onClose} />
    </View>
  );
}

export function VacuumCamera({ deviceId, active, compact, onClose }: VacuumCameraProps): ReactNode {
  const video = useVacuumVideo(deviceId, active);
  const { phase } = video;
  return (
    <View className="absolute inset-0 bg-surface-3">
      <Body
        video={video}
        compact={compact}
        onClose={(): void => {
          video.close();
          onClose();
        }}
      />
      {phase.kind === 'asking' ? (
        <VideoPasswordDialog wrong={phase.wrong} onSubmit={video.submit} onCancel={video.cancel} />
      ) : null}
    </View>
  );
}
