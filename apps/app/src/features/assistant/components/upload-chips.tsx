import type { ReactNode } from 'react';
import { Image, ScrollView } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { entering, exiting, useMotion } from '../../../design/motion';
import { percent } from '../../../format/number';
import { removeUpload, retryUpload, useUploads, type Upload } from '../data/uploads';
import { ComposerChip } from './composer-chip';

function Leading({ upload }: { readonly upload: Upload }): ReactNode {
  if (upload.preview !== null) {
    return (
      <Image
        resizeMethod="resize"
        source={{ uri: upload.preview }}
        accessibilityLabel={upload.name}
        className="size-6 rounded-sm"
      />
    );
  }
  return <Icon name={upload.mime.startsWith('image/') ? 'image' : 'fileText'} size={16} />;
}

const UNSUPPORTED_TEXT = 'Not readable by this model';

function metaOf(upload: Upload, unsupported: boolean): string {
  if (upload.failure !== null) return upload.failure.text;
  if (unsupported) return UNSUPPORTED_TEXT;
  return upload.state === 'uploading' ? percent(upload.progress) : 'Ready';
}

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

function Chip({
  upload,
  unsupported,
}: {
  readonly upload: Upload;
  readonly unsupported: boolean;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      {...exiting(motion, FadeOut.duration(120))}
      className="max-w-full"
    >
      <ComposerChip
        leading={<Leading upload={upload} />}
        label={upload.name}
        meta={metaOf(upload, unsupported)}
        failed={upload.failure !== null || unsupported}
        retry={
          upload.failure?.retryable === true
            ? (): void => {
                retryUpload(upload.key);
              }
            : null
        }
        removeLabel={`Remove ${upload.name}`}
        onRemove={() => {
          removeUpload(upload.key);
        }}
      >
        {upload.state === 'uploading' ? <Progress value={upload.progress} /> : null}
      </ComposerChip>
    </Animated.View>
  );
}

export function UploadChips({
  unsupported,
}: {
  readonly unsupported: ReadonlySet<string>;
}): ReactNode {
  const uploads = useUploads();
  if (uploads.length === 0) return null;
  return (
    <ScrollView
      className="max-h-20 shrink-0 grow-0"
      contentContainerClassName="flex-row flex-wrap gap-2 px-1"
      keyboardShouldPersistTaps="handled"
    >
      {uploads.map((upload) => (
        <Chip key={upload.key} upload={upload} unsupported={unsupported.has(upload.key)} />
      ))}
    </ScrollView>
  );
}
