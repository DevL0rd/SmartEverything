import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { HeaderAction } from '../../../components/page-header';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { SettingsFrame } from '../../../settings/settings-frame';
import { LibraryBody } from '../picker/library/library-body';
import { useModelsRefresh } from '../picker/library/library-refresh';

const MODELS_PAGE = 'assistant/models';
const BROWSE_PICKER = { picked: null, onPick: null } as const;

function useRefreshAction(): HeaderAction | null {
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
  const { width, onLayout } = useMeasuredWidth();
  return (
    <SettingsFrame
      page={MODELS_PAGE}
      scroll={false}
      maxWidth="detail"
      actions={refresh === null ? [] : [refresh]}
    >
      <View onLayout={onLayout} className="min-h-0 flex-1">
        {width === 0 ? null : (
          <LibraryBody mode="browse" width={width} picker={BROWSE_PICKER} note={null} />
        )}
      </View>
    </SettingsFrame>
  );
}
