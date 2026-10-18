import { useCallback, useState } from 'react';
import type { Window } from '../model/lanes';
import type { Reveal } from '../components/member-rows';
import type { GroupPageParams } from '../model/route-params';

export interface GroupPageState {
  readonly expanded: string | null;
  readonly reveal: Reveal | null;
  readonly span: Window;
  readonly editing: boolean;
  readonly colourOpen: boolean;
  readonly toggle: (deviceId: string) => void;
  readonly pick: (deviceId: string) => void;
  readonly setSpan: (span: Window) => void;
  readonly setEditing: (editing: boolean) => void;
  readonly setColourOpen: (open: boolean) => void;
}

export function useGroupPage(params: GroupPageParams, editable: boolean): GroupPageState {
  const [expanded, setExpanded] = useState<string | null>(params.member);
  const [reveal, setReveal] = useState<Reveal | null>(
    params.member === null ? null : { id: params.member, nonce: 1 },
  );
  const [span, setSpan] = useState<Window>('day');
  const [editing, setEditing] = useState(params.edit && editable);
  const [colourOpen, setColourOpen] = useState(false);
  const toggle = useCallback((deviceId: string): void => {
    setExpanded((current) => (current === deviceId ? null : deviceId));
  }, []);
  const pick = useCallback((deviceId: string): void => {
    setExpanded(deviceId);
    setReveal((current) => ({ id: deviceId, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);
  return {
    expanded,
    reveal,
    span,
    editing,
    colourOpen,
    toggle,
    pick,
    setSpan,
    setEditing,
    setColourOpen,
  };
}
