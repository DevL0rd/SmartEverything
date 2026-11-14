import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { createDriveAlbum } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { notifyFailure } from '../../../components/toast-store';
import { smartRuleOf, type SearchInput } from './query';
import { searchTitleOf } from './tokens';

async function saveSmartAlbum(search: SearchInput): Promise<void> {
  const rule = smartRuleOf(search);
  if (rule === null) return;
  const album = await createDriveAlbum({
    kind: 'smart',
    title: searchTitleOf(search.tokens, search.text),
    surface: 'photos',
    scope: 'person',
    rule,
  });
  router.push(href.photosAlbum(album.id));
}

export function SaveSmartAlbum({ search }: { readonly search: SearchInput }): ReactNode {
  const [saving, setSaving] = useState(false);
  if (smartRuleOf(search) === null) return null;
  return (
    <Button
      label="Save as smart album"
      icon="sparkles"
      variant="text"
      loading={saving}
      onPress={() => {
        setSaving(true);
        saveSmartAlbum(search)
          .catch(notifyFailure('The smart album was not saved'))
          .finally(() => {
            setSaving(false);
          });
      }}
    />
  );
}
