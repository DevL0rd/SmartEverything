import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'expo-router';
import type { McpConsentRequest } from '@smarteverything/domain';
import { Sheet } from '../../../components/sheet';
import { useIdiom } from '../../../design/platform';
import { useConsentRequests, useIsOwner } from '../../../store/selectors';
import { TuyaHandoff } from '../flows/tuya-handoff';
import { ConsentButtons, ConsentDetails, consentTitle } from './consent-card';
import { useDecide } from './use-decide';

const OWN_PAGES = ['/connect/assistant', '/consent'] as const;

function ConsentSheet({
  request,
  onClose,
}: {
  readonly request: McpConsentRequest;
  readonly onClose: () => void;
}): ReactNode {
  const decision = useDecide(request, onClose);
  return (
    <Sheet
      open
      onClose={onClose}
      title={consentTitle(request)}
      detents={['fit']}
      footer={<ConsentButtons decision={decision} grow={useIdiom() === 'touch'} />}
    >
      <ConsentDetails request={request} />
    </Sheet>
  );
}

function ConsentQueue(): ReactNode {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const request = useConsentRequests().find((item) => !dismissed.includes(item.id));
  if (request === undefined || OWN_PAGES.some((page) => pathname.startsWith(page))) {
    return null;
  }
  return (
    <ConsentSheet
      key={request.id}
      request={request}
      onClose={() => {
        setDismissed([...dismissed, request.id]);
      }}
    />
  );
}

export function ConsentHost(): ReactNode {
  if (!useIsOwner()) {
    return null;
  }
  return (
    <>
      <ConsentQueue />
      <TuyaHandoff />
    </>
  );
}
