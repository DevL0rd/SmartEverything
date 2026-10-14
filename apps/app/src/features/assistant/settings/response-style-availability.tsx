import { useConnection } from '../../../api/transport';
import { useActiveProfile } from '../../../store/people';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useEntityStore } from '../../../store/store-context';
import { useSyncStatus } from '../../../store/selectors';
import {
  refreshResponseStyle,
  useResponseStyleProblem,
} from '../../../store/assistant-response-style';
export function ResponseStyleAvailability(): ReactNode {
  const store = useEntityStore();
  const connection = useConnection();
  const profileId = useActiveProfile()?.id;
  const live = useSyncStatus().status === 'live';
  const problem = useResponseStyleProblem();
  useEffect(() => {
    if (live) void refreshResponseStyle(store);
  }, [store, live, connection, profileId]);
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="footnote" tone="variant">
        {problem ??
          'Shared tone and presentation for SmartEverything replies and supported voice prompts. Independent Claude and Codex providers do not receive these preferences.'}
      </Text>
      {problem === null ? null : (
        <Button
          label="Try again"
          variant="text"
          onPress={() => {
            void refreshResponseStyle(store);
          }}
        />
      )}
    </View>
  );
}
