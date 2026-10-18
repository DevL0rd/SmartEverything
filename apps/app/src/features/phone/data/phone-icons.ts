import { skipToken } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type PhoneIconUpload } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';

export function phoneIconKey(hash: string | null): readonly ['phone-icon', string | null] {
  return ['phone-icon', hash];
}

export function iconUriOf(icon: PhoneIconUpload): string {
  return `data:image/webp;base64,${icon.webpBase64}`;
}

function readIcon(hash: string): Promise<PhoneIconUpload> {
  return api().call(E.readPhoneIcon, { params: { hash } });
}

export function usePhoneIcon(hash: string | null): string | null {
  const query = useScreenQuery({
    queryKey: phoneIconKey(hash),
    queryFn: hash === null ? skipToken : (): Promise<PhoneIconUpload> => readIcon(hash),
    select: iconUriOf,
    gcTime: Infinity,
  });
  return query.data ?? null;
}
