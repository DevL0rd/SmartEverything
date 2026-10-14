import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../button';
import { SearchField } from '../search-field';
import { Section } from '../section';
import { Text } from '../text';

export interface FeedChromeProps {
  readonly words: string;
  readonly changeWords: (value: string) => void;
  readonly context: boolean;
  readonly missingAnchor: boolean;
  readonly back: () => void;
  readonly latest: () => void;
  readonly controls: ReactNode;
  readonly focusSearch: boolean;
}

export function FeedChrome(props: FeedChromeProps): ReactNode {
  return (
    <Section
      title="Transcripts"
      action={<Button label="Latest" icon="arrowUp" variant="text" onPress={props.latest} />}
    >
      {props.controls}
      {!props.context ? (
        <SearchField
          value={props.words}
          onChange={props.changeWords}
          placeholder="Search what was said"
          variant="field"
          focusOnMount={props.focusSearch}
        />
      ) : (
        <View className="flex-row flex-wrap items-center gap-2">
          <Button
            label={props.words === '' ? 'Back to feed' : 'Back to results'}
            icon="arrowLeft"
            variant="text"
            onPress={props.back}
          />
          {props.missingAnchor ? null : (
            <Text variant="footnote" tone="variant">
              Selected line highlighted
            </Text>
          )}
        </View>
      )}
    </Section>
  );
}
