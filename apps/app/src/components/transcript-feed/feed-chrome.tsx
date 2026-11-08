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
  readonly inlineControls: boolean;
  readonly focusSearch: boolean;
}

function FeedInputs(props: FeedChromeProps): ReactNode {
  const search = props.context ? null : (
    <SearchField
      value={props.words}
      onChange={props.changeWords}
      placeholder="Search what was said"
      variant="field"
      focusOnMount={props.focusSearch}
    />
  );
  if (props.inlineControls) {
    return (
      <View className="flex-row flex-wrap items-end gap-x-2 gap-y-1">
        <View className="min-w-0 grow shrink basis-52">{props.controls}</View>
        {search === null ? null : <View className="min-w-0 grow shrink basis-64">{search}</View>}
      </View>
    );
  }
  return (
    <>
      {props.controls}
      {search}
    </>
  );
}

export function FeedChrome(props: FeedChromeProps): ReactNode {
  return (
    <Section
      title="Transcripts"
      action={<Button label="Latest" icon="arrowUp" variant="text" onPress={props.latest} />}
    >
      <FeedInputs {...props} />
      {props.context ? (
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
      ) : null}
    </Section>
  );
}
