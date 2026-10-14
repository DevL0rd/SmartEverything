import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { entering, exiting, useMotion } from '../../../design/motion';
import { percent } from '../../../format/number';
import { removeUpload, retryUpload, useUploads, type Upload } from '../data/uploads';
import { Button } from '../../../components/button';

function Thumb({ upload }: { readonly upload: Upload }): ReactNode {
  if (upload.preview !== null) {
    return (
      <Image
        source={{ uri: upload.preview }}
        accessibilityLabel={upload.name}
        className="size-10 rounded-md"
      />
    );
  }
  return (
    <View className="size-10 items-center justify-center rounded-md bg-primary/15">
      <Icon name="fileText" size={20} tone="primary" />
    </View>
  );
}

const STATE_TEXT = {
  uploading: (upload: Upload) => percent(upload.progress),
  done: () => 'Ready',
  failed: () => 'Failed',
} as const;

function Progress({ value }: { readonly value: number }): ReactNode {
  const { reduced } = useMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(reduced ? value : withTiming(value, { duration: 200 }));
  }, [shown, value, reduced]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: shown.get() }] }));
  return (
    <Animated.View
      style={fill}
      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
    />
  );
}

function Chip({ upload }: { readonly upload: Upload }): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      {...exiting(motion, FadeOut.duration(120))}
      className={cn(
        'w-56 flex-row items-center gap-2 overflow-hidden rounded-lg border-hairline bg-surface-2 py-1 pl-1',
        upload.state === 'failed' ? 'border-critical' : 'border-outline-variant',
      )}
    >
      <Thumb upload={upload} />
      <View className="min-w-0 flex-1">
        <Text variant="caption" numberOfLines={1}>
          {upload.name}
        </Text>
        <Text variant="caption" tone={upload.state === 'failed' ? 'critical' : 'variant'}>
          {STATE_TEXT[upload.state](upload)}
        </Text>
      </View>
      {upload.state === 'failed' ? (
        <Button
          label="Retry"
          variant="text"
          onPress={() => {
            retryUpload(upload.key);
          }}
        />
      ) : null}
      <IconButton
        icon="close"
        label={`Remove ${upload.name}`}
        onPress={() => {
          removeUpload(upload.key);
        }}
      />
      {upload.state === 'uploading' ? <Progress value={upload.progress} /> : null}
    </Animated.View>
  );
}

export function UploadChips(): ReactNode {
  const uploads = useUploads();
  if (uploads.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {uploads.map((upload) => (
        <Chip key={upload.key} upload={upload} />
      ))}
    </View>
  );
}
