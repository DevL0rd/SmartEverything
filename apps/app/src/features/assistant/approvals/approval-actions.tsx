import { useContext, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useKeyboard } from '../../../app-shell/shortcuts';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import { TextField } from '../../../components/text-field';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { DockScopeContext } from './dock-scope';
import { isAllowChord } from './needs-you-model';
import { focusIsInside } from './use-dock-focus';

export interface ApprovalHandlers {
  readonly allow: () => void;
  readonly deny: () => void;
  readonly cancel: () => void;
  readonly tell: (text: string) => void;
}

function DenySplit({
  pending,
  deny,
  cancel,
  grow,
}: Pick<ApprovalHandlers, 'deny' | 'cancel'> & {
  readonly pending: boolean;
  readonly grow: boolean;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(
    [
      { label: 'Deny', icon: 'ban', onPress: deny },
      { label: 'Cancel request', icon: 'close', onPress: cancel },
    ],
    'Deny options',
  );
  return (
    <View
      ref={ref}
      collapsable={false}
      className={cn('flex-row items-center gap-px', grow && 'flex-1')}
    >
      <Button label="Deny" variant="outlined" size="lg" grow disabled={pending} onPress={deny} />
      <IconButton icon="chevronDown" label="More deny options" disabled={pending} onPress={open} />
      {menu}
    </View>
  );
}

function TellField({
  pending,
  tell,
}: Pick<ApprovalHandlers, 'tell'> & { readonly pending: boolean }): ReactNode {
  const [text, setText] = useState('');
  const send = (): void => {
    if (text.trim() !== '') tell(text.trim());
  };
  return (
    <View className="flex-row items-end gap-2">
      <View className="min-w-0 flex-1">
        <TextField
          label="Tell it what to do instead"
          value={text}
          onChange={setText}
          onSubmit={send}
          placeholder="Use git clean instead"
          disabled={pending}
          focusOnMount
        />
      </View>
      <Button label="Send" size="lg" disabled={pending || text.trim() === ''} onPress={send} />
    </View>
  );
}

export function ApprovalActions({
  pending,
  allow,
  deny,
  cancel,
  tell,
}: ApprovalHandlers & { readonly pending: boolean }): ReactNode {
  const touch = useIdiom() === 'touch';
  const own = useRef<View>(null);
  const scope = useContext(DockScopeContext);
  const [telling, setTelling] = useState(false);
  useKeyboard((press) => {
    if (!scope.active || !isAllowChord(press, pending) || !focusIsInside(scope.root ?? own))
      return false;
    allow();
    return true;
  }, true);
  return (
    <View ref={own} className="gap-2">
      <View className="flex-row items-center gap-2">
        <Button label="Allow once" size="lg" grow={touch} disabled={pending} onPress={allow} />
        <DenySplit pending={pending} deny={deny} cancel={cancel} grow={touch} />
      </View>
      <View className="items-start">
        <Button
          label="Tell it what to do instead…"
          variant="text"
          disabled={pending}
          onPress={() => {
            setTelling(!telling);
          }}
        />
      </View>
      {telling ? <TellField pending={pending} tell={tell} /> : null}
    </View>
  );
}
