import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { Section } from '../../../components/section';
import { driveSettingsSection, type DriveSettingsSectionId } from './sections';

export function DriveSettingsSection({
  section,
  children,
}: {
  readonly section: DriveSettingsSectionId;
  readonly children: ReactNode;
}): ReactNode {
  const spec = driveSettingsSection(section);
  return (
    <Section title={spec.title} caption={spec.caption}>
      {children}
    </Section>
  );
}

export function DriveSettingsStub({
  section,
}: {
  readonly section: DriveSettingsSectionId;
}): ReactNode {
  const spec = driveSettingsSection(section);
  return (
    <EmptyState
      compact
      icon={spec.icon}
      title={spec.title}
      body="These settings are not available yet."
    />
  );
}
