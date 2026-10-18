import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { footerText } from './footer-model';

export function AdGuardFooter({ snapshot }: { readonly snapshot: AdGuardSnapshot }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      {footerText(snapshot)}
    </Text>
  );
}
