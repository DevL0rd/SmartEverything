import type { ReactNode } from 'react';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { tokenIconOf, tokenKey, type SearchToken } from './tokens';

export const SEARCH_HINT = "Search by person, place, date or what's in the photo";

export const SEARCH_PLACEHOLDER = 'Search photos';

export const FILTER_HINT = 'Add a filter';

export const UNUSED_NOTE = 'Not used on this tab';

function TokenChip({
  token,
  unused,
  onRemove,
}: {
  readonly token: SearchToken;
  readonly unused: boolean;
  readonly onRemove: (token: SearchToken) => void;
}): ReactNode {
  const tone = unused ? 'variant' : 'primary';
  return (
    <Interactive
      role="button"
      label={unused ? `Remove ${token.label}, ${UNUSED_NOTE}` : `Remove ${token.label}`}
      onPress={() => {
        onRemove(token);
      }}
      className={cn(
        'h-8 max-w-full flex-row items-center gap-1.5 rounded-full pl-2.5 pr-2',
        unused ? 'border border-dashed border-outline bg-surface-2' : 'bg-primary-container',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={tokenIconOf(token)} size={16} tone={tone} />
      <Text
        variant="label"
        tone={unused ? 'variant' : 'default'}
        className={cn('shrink', !unused && 'text-on-primary-container')}
        numberOfLines={1}
      >
        {token.label}
      </Text>
      <Icon name="close" size={16} tone={tone} />
    </Interactive>
  );
}

export function SearchTokens({
  tokens,
  unused,
  onRemove,
}: {
  readonly tokens: readonly SearchToken[];
  readonly unused: ReadonlySet<string>;
  readonly onRemove: (token: SearchToken) => void;
}): ReactNode {
  return tokens.map((token) => (
    <TokenChip
      key={tokenKey(token)}
      token={token}
      unused={unused.has(tokenKey(token))}
      onRemove={onRemove}
    />
  ));
}
