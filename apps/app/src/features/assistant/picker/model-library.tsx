import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Engine } from '@smarteverything/domain';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import type { ModelPickerProps } from '../data/model-candidates';
import type { NativeModelRequest } from '../provider/subscription-models';
import { LibraryBody } from './library/library-body';
import {
  dialogWidth,
  librarySubtitle,
  libraryTitle,
  type LibraryMode,
} from './library/library-model';
import { engineOf, pickOf } from './library/library-pick';
import { useModelsRefresh, type ModelsRefresh } from './library/library-refresh';

export { useLibraryDisclosure } from './library/library-disclosure';

interface Picking {
  readonly mode: 'pick' | 'default';
  readonly engine: Engine;
  readonly onChange: ((engine: Engine) => void) | null;
  readonly note?: string | null;
  readonly initialQuery?: string;
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
}

interface Browsing {
  readonly mode: 'browse';
}

export type ModelLibraryProps = (Picking | Browsing) & {
  readonly open: boolean;
  readonly onClose: () => void;
};

function pickerOf(props: Picking | Browsing, close: () => void): ModelPickerProps {
  if (props.mode === 'browse') return { picked: null, onPick: null };
  const { onChange, onNativeNeeded } = props;
  return {
    picked: pickOf(props.engine),
    ...(props.initialQuery === undefined ? {} : { initialQuery: props.initialQuery }),
    onPick:
      onChange === null
        ? null
        : (pick): void => {
            onChange(engineOf(pick));
            close();
          },
    onNativeNeeded:
      onNativeNeeded === undefined
        ? undefined
        : (request): void => {
            onNativeNeeded(request);
            close();
          },
  };
}

function noteOf(props: Picking | Browsing): string | null {
  return props.mode === 'browse' ? null : (props.note ?? null);
}

function RefreshButton({ refresh }: { readonly refresh: ModelsRefresh | null }): ReactNode {
  return refresh === null ? null : (
    <Button
      label="Refresh"
      variant="outlined"
      icon={refresh.busy ? 'loader' : 'refresh'}
      loading={refresh.busy}
      onPress={refresh.run}
    />
  );
}

function Header({
  mode,
  onClose,
  refresh,
}: {
  readonly mode: LibraryMode;
  readonly onClose: () => void;
  readonly refresh: ModelsRefresh | null;
}): ReactNode {
  const subtitle = librarySubtitle(mode);
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant py-2 pl-5 pr-2">
      <View className="min-w-0 flex-1">
        <Text variant="title-3" accessibilityRole="header">
          {libraryTitle(mode)}
        </Text>
        {subtitle === null ? null : (
          <Text variant="footnote" tone="variant">
            {subtitle}
          </Text>
        )}
      </View>
      {mode === 'browse' ? <RefreshButton refresh={refresh} /> : null}
      <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />
    </View>
  );
}

function Dialog(props: ModelLibraryProps): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  const width = dialogWidth(useWindowDimensions().width);
  const refresh = useModelsRefresh();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(250))}
      accessibilityViewIsModal
      aria-modal
      role="dialog"
      accessibilityLabel={libraryTitle(props.mode)}
      onLayout={shown}
      className="h-full max-h-190 w-full max-w-240 overflow-hidden rounded-xl bg-surface-raised elevation-3"
    >
      <Header mode={props.mode} onClose={props.onClose} refresh={refresh} />
      <LibraryBody
        mode={props.mode}
        width={width}
        picker={pickerOf(props, props.onClose)}
        note={noteOf(props)}
      />
    </Animated.View>
  );
}

function PointerLibrary(props: ModelLibraryProps): ReactNode {
  return (
    <Overlay
      open={props.open}
      onClose={props.onClose}
      label={libraryTitle(props.mode)}
      scrim
      className="items-center justify-center p-6"
    >
      {props.open ? <Dialog {...props} /> : null}
    </Overlay>
  );
}

function TouchLibrary(props: ModelLibraryProps): ReactNode {
  const refresh = useModelsRefresh();
  const { width } = useWindowDimensions();
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      title={libraryTitle(props.mode)}
      label={libraryTitle(props.mode)}
      detents={['full']}
      scroll={false}
      {...(props.mode === 'browse' && refresh !== null
        ? { footer: <RefreshButton refresh={refresh} /> }
        : {})}
    >
      {props.open ? (
        <View className="-mx-4 min-h-0 flex-1">
          <LibraryBody
            mode={props.mode}
            width={width}
            picker={pickerOf(props, props.onClose)}
            note={noteOf(props)}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

export function ModelLibrary(props: ModelLibraryProps): ReactNode {
  const touch = useIdiom() === 'touch';
  return touch ? <TouchLibrary {...props} /> : <PointerLibrary {...props} />;
}
