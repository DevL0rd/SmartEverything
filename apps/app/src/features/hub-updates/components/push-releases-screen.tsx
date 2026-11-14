import type { ReactNode } from 'react';
import type { UpdateRevision } from '@smarteverything/domain';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { anchorKey } from '../../../components/highlight-keys';
import { LoadedQuery } from '../../../components/loaded-query';
import { Section } from '../../../components/section';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useSettingsFocus } from '../../../settings/settings-focus';
import { useIsOwner } from '../../../store/selectors';
import { useUpdateRevisions } from '../data/update-queries';
import { PUSH_RELEASES_PAGE, PUSHED_REVISIONS_SETTING, SETTINGS } from '../settings';
import { PushSetupCard } from './push-setup-card';
import { RevisionCard } from './revision-card';

function RevisionList({ revisions }: { readonly revisions: readonly UpdateRevision[] }): ReactNode {
  const anchor = useHighlightAnchor(
    anchorKey.setting(PUSHED_REVISIONS_SETTING),
    'Pushed revisions',
  );
  return (
    <View {...anchor}>
      <Section title="Pushed revisions">
        <View className="gap-3">
          {revisions.length === 0 ? (
            <EmptyState
              compact
              icon="upload"
              title="No pushes yet"
              body="Each push to the update branch shows here with what it releases and how far it got."
            />
          ) : (
            revisions.map((revision) => <RevisionCard key={revision.id} revision={revision} />)
          )}
        </View>
      </Section>
    </View>
  );
}

function OwnerPushReleases(): ReactNode {
  const pipeline = useUpdateRevisions();
  return (
    <LoadedQuery query={pipeline}>
      {(data) => (
        <View className="gap-6">
          <PushSetupCard push={data.push} />
          <RevisionList revisions={data.revisions} />
        </View>
      )}
    </LoadedQuery>
  );
}

export function PushReleasesScreen(): ReactNode {
  useSettingsFocus(SETTINGS);
  const owner = useIsOwner();
  return (
    <SettingsFrame page={PUSH_RELEASES_PAGE}>{owner ? <OwnerPushReleases /> : null}</SettingsFrame>
  );
}
