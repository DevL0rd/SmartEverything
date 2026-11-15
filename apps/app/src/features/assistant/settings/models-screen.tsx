import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useIsFocused } from 'expo-router';
import { View } from 'react-native';
import { useFocusRequest } from '../../../components/focus-request';
import { useHostedNativeBack } from '../../../components/hosted-sheet-pages';
import { IconButton } from '../../../components/icon-button';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { SettingsFrame } from '../../../settings/settings-frame';
import { LibraryBody } from '../picker/library/library-body';
import { useModelsRefresh } from '../picker/library/library-refresh';
import { useLibraryState, type LibraryState } from '../picker/library/library-state';
import { MODEL_SEARCH_PLACEHOLDER } from '../picker/library/library-tools';
import { PanelSubpageContext } from '../picker/panel/panel-subpage-context';

const MODELS_PAGE = 'assistant/models';
const BROWSE_PICKER = { picked: null, onPick: null } as const;

function useRefreshAction(): ShellAction | null {
  const refresh = useModelsRefresh();
  if (refresh === null) return null;
  return {
    icon: refresh.busy ? 'loader' : 'refresh',
    label: refresh.busy ? 'Updating' : 'Refresh',
    iconOnly: true,
    onPress: refresh.run,
  };
}

export function ModelsScreen(): ReactNode {
  const refresh = useRefreshAction();
  const state = useLibraryState('');
  return (
    <SettingsFrame
      page={MODELS_PAGE}
      scroll={false}
      actions={refresh === null ? [] : [refresh]}
      search={{
        value: state.text,
        onChange: state.setText,
        placeholder: MODEL_SEARCH_PLACEHOLDER,
        label: MODEL_SEARCH_PLACEHOLDER,
      }}
    >
      <ModelsCatalogue state={state} />
    </SettingsFrame>
  );
}

function ModelsCatalogue({ state }: { readonly state: LibraryState }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const focused = useIsFocused();
  const localBack = useRef<(() => void) | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const subpage = useMemo(
    () => ({
      setTitle,
      registerBack: (back: () => void): (() => void) => {
        localBack.current = back;
        return (): void => {
          if (localBack.current === back) localBack.current = null;
        };
      },
    }),
    [],
  );
  const back = (): void => {
    localBack.current?.();
  };
  const active = focused && title !== null;
  const backRef = useFocusRequest(active);
  useEscape(active, back);
  useHostedNativeBack(active, back);
  return (
    <View onLayout={onLayout} className="min-h-0 flex-1">
      {title === null ? null : (
        <View className="flex-row items-center gap-1 border-b border-outline-variant px-2">
          <IconButton ref={backRef} icon="chevronLeft" label="Back to models" onPress={back} />
          <Text variant="body-strong" accessibilityRole="header">
            {title}
          </Text>
        </View>
      )}
      <PanelSubpageContext value={subpage}>
        {width === 0 ? null : (
          <LibraryBody
            mode="browse"
            width={width}
            picker={BROWSE_PICKER}
            note={null}
            state={state}
            searchField={null}
          />
        )}
      </PanelSubpageContext>
    </View>
  );
}
