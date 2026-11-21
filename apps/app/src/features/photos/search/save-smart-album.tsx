import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { notifyFailure } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { createAlbumShown } from '../../drive';
import { smartRuleOf, type SearchInput } from './query';
import { searchTitleOf } from './tokens';

function saveSmartAlbum(store: EntityStore, client: QueryClient, search: SearchInput): void {
  const rule = smartRuleOf(search);
  if (rule === null) return;
  const id = randomUUID();
  createAlbumShown(store, client, {
    id,
    kind: 'smart',
    title: searchTitleOf(search.tokens, search.text),
    surface: 'photos',
    scope: 'person',
    rule,
  }).catch(notifyFailure('The smart album was not saved'));
  router.push(href.photosAlbum(id));
}

export function SaveSmartAlbum({ search }: { readonly search: SearchInput }): ReactNode {
  const store = useEntityStore();
  const client = useQueryClient();
  if (smartRuleOf(search) === null) return null;
  return (
    <Button
      label="Save as smart album"
      icon="sparkles"
      variant="text"
      onPress={() => {
        saveSmartAlbum(store, client, search);
      }}
    />
  );
}
