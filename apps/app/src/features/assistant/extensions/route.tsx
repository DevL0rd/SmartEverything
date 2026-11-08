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
  search: z.string().optional(),
  source: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  sourcePath: z.string().min(1).optional(),
  originUrl: z.string().min(1).optional(),
  originRef: z.string().min(1).optional(),
  originPath: z.string().min(1).optional(),
});

export function AiExtensionsRoute(): ReactNode {
  const raw = useLocalSearchParams();
  const params = PARAMS.safeParse(raw);
  const skill = Array.isArray(raw['page']) && raw['page'][1] === 'skills';
  if (!params.success)
    return (
      <SettingsFrame page={skill ? 'assistant/skills' : 'assistant/extensions'}>
        <EmptyState
          icon={skill ? 'fileText' : 'puzzle'}
          title={skill ? 'Skill link unavailable' : 'Extension link unavailable'}
          body="Browse the catalogue to find this item."
          action={
            <Button
              label={skill ? 'Browse skills' : 'Browse extensions'}
              variant="tonal"
              href={extensionBrowseHref(skill ? 'skill' : 'extension')}
            />
          }
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
