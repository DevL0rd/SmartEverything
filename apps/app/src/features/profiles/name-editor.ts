import { useRef, useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { focusView } from '../../components/focus-request';
import type { TextEditRequest } from '../../settings/text-edit-sheet';

export function useNameEditor(): {
  readonly opener: RefObject<View | null>;
  readonly request: TextEditRequest | null;
  readonly open: (request: TextEditRequest) => void;
  readonly close: () => void;
} {
  const opener = useRef<View>(null);
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  return {
    opener,
    request,
    open: (next): void => {
      setRequest({ ...next, opener });
    },
    close: (): void => {
      setRequest(null);
      requestAnimationFrame(() => {
        focusView(opener.current);
      });
    },
  };
}
