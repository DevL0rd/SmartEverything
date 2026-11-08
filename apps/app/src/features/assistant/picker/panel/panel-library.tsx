import { useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import { MARGIN, type PanelSize } from '../../../../components/anchor';
import { useFocusRequest } from '../../../../components/focus-request';
import { cn } from '../../../../design/cn';
import { ImageLibraryBody } from '../image/image-library-body';
import { LibraryBody } from '../library/library-body';
import {
  IMAGE_LIBRARY_DIALOG_MAX_WIDTH,
  LIBRARY_DIALOG_MAX_HEIGHT,
  LIBRARY_DIALOG_MAX_WIDTH,
  libraryTitle,
} from '../library/library-model';
import { PanelHead } from './panel-chrome';
import { LibraryActionFocus } from '../library/library-pages';
import { CatalogueFit, catalogueHeight, useCatalogueFit } from '../library/catalogue-fit';
import type { PanelPicker } from './use-panel-picker';

export interface PanelLibraryProps {
  readonly image: boolean;
  readonly pick: PanelPicker;
  readonly note: string | null;
  readonly onClose: () => void;
}

function titleOf(image: boolean): string {
  return image ? 'Image model library' : libraryTitle('pick');
}

const TEXT_LIBRARY_SIZE: PanelSize = {
  width: LIBRARY_DIALOG_MAX_WIDTH,
  dialogWidth: LIBRARY_DIALOG_MAX_WIDTH,
  maxHeight: LIBRARY_DIALOG_MAX_HEIGHT,
  minHeight: 0,
};
const IMAGE_LIBRARY_SIZE: PanelSize = {
  ...TEXT_LIBRARY_SIZE,
  width: IMAGE_LIBRARY_DIALOG_MAX_WIDTH,
  dialogWidth: IMAGE_LIBRARY_DIALOG_MAX_WIDTH,
};

export function libraryPanelSize(image: boolean): PanelSize {
  return image ? IMAGE_LIBRARY_SIZE : TEXT_LIBRARY_SIZE;
}

function Catalogue({
  image,
  pick,
  note,
  width,
  compact,
  onClose,
}: PanelLibraryProps & { readonly width: number; readonly compact?: boolean }): ReactNode {
  return image ? (
    <ImageLibraryBody onClose={onClose} compact={compact === true} />
  ) : (
    <LibraryBody
      mode="pick"
      width={width}
      picker={pick.picker}
      note={note}
      compact={compact === true}
    />
  );
}

interface InlineLibraryProps extends PanelLibraryProps {
  readonly onBack: () => void;
  readonly visible: boolean;
  readonly restoreMachineFocus: boolean;
  readonly localTitle: string | null;
}

function useLibraryFrame(image: boolean): {
  readonly width: number;
  readonly maxHeight: number;
  readonly sheet: boolean;
} {
  const frame = usePanelFrame();
  const window = useWindowDimensions();
  const sheet = frame.presentation === 'sheet';
  const size = libraryPanelSize(image);
  return {
    width: sheet ? frame.width : Math.max(1, Math.min(size.width, window.width - 2 * MARGIN)),
    maxHeight: sheet
      ? frame.height
      : Math.max(1, Math.min(size.maxHeight, window.height - 2 * MARGIN)),
    sheet,
  };
}

function LibraryHeading({
  image,
  onBack,
  onClose,
  visible,
  restoreMachineFocus,
  localTitle,
  sheet,
  onHeight,
}: InlineLibraryProps & {
  readonly sheet: boolean;
  readonly onHeight: (height: number) => void;
}): ReactNode {
  const focus = useFocusRequest(sheet && visible && !restoreMachineFocus);
  const localFocus = useFocusRequest(visible && localTitle !== null && !restoreMachineFocus);
  const title = titleOf(image);
  return (
    <View
      className={sheet ? '' : 'border-b border-outline-variant px-2 py-2'}
      onLayout={(event): void => {
        const { height } = event.nativeEvent.layout;
        if (height > 0) onHeight(height);
      }}
    >
      <PanelHead
        title={localTitle ?? title}
        onBack={onBack}
        backLabel={localTitle === null ? 'Back to models and thinking' : `Back to ${title}`}
        onClose={onClose}
        backRef={localTitle === null ? focus : localFocus}
      />
    </View>
  );
}

export function InlinePanelLibrary(props: InlineLibraryProps): ReactNode {
  const { width, maxHeight, sheet } = useLibraryFrame(props.image);
  const [headingHeight, setHeadingHeight] = useState(0);
  const [measurements, measure] = useCatalogueFit();
  const height =
    props.localTitle === null ? catalogueHeight(maxHeight, headingHeight, measurements) : maxHeight;
  const frameStyle = { height };
  const restore = props.visible && props.restoreMachineFocus;
  return (
    <View style={frameStyle} className="min-h-0 shrink">
      <LibraryHeading {...props} sheet={sheet} onHeight={setHeadingHeight} />
      <View className={cn('min-h-0 flex-1', sheet && '-mx-3')}>
        <LibraryActionFocus value={restore}>
          <CatalogueFit value={measure}>
            <Catalogue {...props} width={width} compact={sheet} />
          </CatalogueFit>
        </LibraryActionFocus>
      </View>
    </View>
  );
}
