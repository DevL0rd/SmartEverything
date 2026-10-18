import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { SettingsFrame } from '../../../settings/settings-frame';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { AiExtensionsScreen } from './list-screen';
import { BrowseAiExtensionsScreen } from './browse-screen';
import { AiExtensionScreen } from './detail-screen';
import { BundledSkillScreen } from './bundled-skill-screen';
import { DiscoveryScreen } from './discovery-screen';
import { SkillUpdatesScreen } from './updates-screen';
import { extensionBrowseHref } from './links';

const PARAMS = z.object({
  inspect: z.literal('true').optional(),
  discoveryId: z.string().max(400).optional(),
  view: z.enum(['browse', 'detail']).optional(),
  page: z.array(z.string()).optional(),
  extensionId: z.string().max(400).optional(),
  skillId: z.string().max(200).optional(),
  section: z.enum(['devices', 'source', 'import']).optional(),
});

export function AiExtensionsRoute(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  if (!params.success)
    return (
      <SettingsFrame page="assistant/extensions">
        <EmptyState
          icon="puzzle"
          title="That link doesn’t open an extension"
          body="The link isn’t valid. Browse extensions to find it."
          action={<Button label="Browse extensions" variant="tonal" href={extensionBrowseHref()} />}
        />
      </SettingsFrame>
    );
  return routeView(params.data);
}
function routeView(params: z.infer<typeof PARAMS>): ReactNode {
  const view = params.view ?? params.page?.[2];
  const kind = params.page?.[1] === 'skills' ? 'skill' : 'extension';
  if (view === 'browse' || view === 'add') return <BrowseAiExtensionsScreen kind={kind} />;
  if (view === 'updates') return <SkillUpdatesScreen />;
  if (view === 'detail') return detailRoute(params);
  return <AiExtensionsScreen kind={kind} />;
}
function detailRoute(params: z.infer<typeof PARAMS>): ReactNode {
  if (params.discoveryId !== undefined) return <DiscoveryScreen />;
  return params.skillId === undefined ? <AiExtensionScreen /> : <BundledSkillScreen />;
}
