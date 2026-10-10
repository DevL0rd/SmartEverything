import type { ReactNode } from 'react';
import { PageHeader } from '../src/components/page-header';
import { Screen } from '../src/components/screen';
import { PrivacyContent } from '../src/features/privacy/privacy-content';

export default function PrivacyRoute(): ReactNode {
  return (
    <Screen header={<PageHeader title="SmartEverything privacy" back={false} />} maxWidth="reading">
      <PrivacyContent />
    </Screen>
  );
}
