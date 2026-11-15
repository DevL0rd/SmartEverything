import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { count } from '../../../format/number';
import { FaceAvatar } from '../people/face-avatar';
import {
  flatSuggestions,
  type Suggestion,
  type SuggestionFace,
  type SuggestionGroup,
} from './suggest';
import { tokenIconOf, tokenKey } from './tokens';

export interface SuggestionsProps {
  readonly groups: readonly SuggestionGroup[];
  readonly words: string;
  readonly highlight: number;
  readonly onPick: (suggestion: Suggestion) => void;
  readonly onWords: () => void;
}

interface RowProps {
  readonly icon: IconName;
  readonly label: string;
  readonly quantity: number | null;
  readonly hot: boolean;
  readonly onPress: () => void;
  readonly face?: SuggestionFace | undefined;
  readonly detail?: string | undefined;
}

function Lead({
  icon,
  face,
  pointer,
}: {
  readonly icon: IconName;
  readonly face: SuggestionFace | undefined;
  readonly pointer: boolean;
}): ReactNode {
  if (face === undefined) return <Icon name={icon} size={pointer ? 16 : 20} tone="variant" />;
  return (
    <FaceAvatar itemId={face.itemId} box={face.box} kind={face.kind} size={pointer ? 24 : 32} />
  );
}

function Row({ icon, label, quantity, hot, onPress, face, detail }: RowProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      role="button"
      label={quantity === null ? label : `${label}, ${count(quantity)}`}
      selected={hot}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-sm px-2',
        pointer ? 'min-h-9' : 'min-h-touch-min',
        hot && 'bg-surface-3',
      )}
      layerClassName="rounded-sm"
    >
      <Lead icon={icon} face={face} pointer={pointer} />
      <View className="min-w-0 flex-1">
        <Text variant={pointer ? 'footnote' : 'body'} numberOfLines={1}>
          {label}
        </Text>
        {detail === undefined ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      {quantity === null ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {count(quantity)}
        </Text>
      )}
    </Interactive>
  );
}

function GroupTitle({ title }: { readonly title: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" className="px-1 pb-1 pt-2">
      {title}
    </Text>
  );
}

function KeyHint(): ReactNode {
  const hint = (key: string): ReactNode => (
    <View className="rounded-xs border border-outline px-1.5 py-0.5">
      <Text variant="caption" tone="variant">
        {key}
      </Text>
    </View>
  );
  return (
    <View className="flex-row flex-wrap items-center gap-2 border-t border-outline-variant px-1 pt-2">
      {hint('Enter')}
      <Text variant="caption" tone="variant">
        adds a filter
      </Text>
      {hint('Backspace')}
      <Text variant="caption" tone="variant">
        removes the last one
      </Text>
    </View>
  );
}

export function Suggestions(props: SuggestionsProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const words = props.words.trim();
  const flat = flatSuggestions(props.groups);
  const positions = new Map(flat.map((item, position) => [tokenKey(item.token), position]));
  const total = flat.length;
  return (
    <View className="gap-0.5 rounded-lg bg-surface-2 p-2 elevation-2">
      {props.groups.map((group) => (
        <View key={group.id} className="gap-0.5">
          <GroupTitle title={group.title} />
          {group.items.map((item) => (
            <Row
              key={tokenKey(item.token)}
              icon={tokenIconOf(item.token)}
              label={item.token.label}
              quantity={item.count}
              face={item.face}
              detail={item.detail}
              hot={positions.get(tokenKey(item.token)) === props.highlight}
              onPress={() => {
                props.onPick(item);
              }}
            />
          ))}
        </View>
      ))}
      <GroupTitle title="Words" />
      <Row
        icon="search"
        label={`Search for “${words}”`}
        quantity={null}
        hot={props.highlight === total}
        onPress={props.onWords}
      />
      {pointer ? <KeyHint /> : null}
    </View>
  );
}
