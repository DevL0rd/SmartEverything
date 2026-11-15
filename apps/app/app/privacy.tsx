import type { ReactNode } from 'react';
import { PageShell } from '../src/components/page-shell/page-shell';
import { PrivacyContent } from '../src/features/privacy/privacy-content';

export default function PrivacyRoute(): ReactNode {
  return (
    <PageShell title="SmartEverything privacy" back={false}>
      <PrivacyContent />
    </PageShell>
  );
}
