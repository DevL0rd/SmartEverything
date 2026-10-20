import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { useBottleAct } from '../data/bottle-act';
import { bindingNotice } from '../model/bottle-model';

export function BindingNotice({ view }: { readonly view: BottleStatusView }): ReactNode {
  const { act, busy } = useBottleAct(view.deviceId);
  const notice = bindingNotice(view);
  if (notice === null) {
    return null;
  }
  return (
    <View className="gap-2">
      <Banner tone="info" title={notice.title} body={notice.body} wrapBody />
      <View className="flex-row gap-3">
        <Button
          label="Keep"
          variant="tonal"
          loading={busy}
          onPress={() => {
            act({ action: 'keep_binding' }, 'Could not keep the link');
          }}
        />
        <Button
          label="Unlink"
          variant="outlined"
          disabled={busy}
          onPress={() => {
            act({ action: 'bind_person', personId: null }, 'Could not unlink the bottle');
          }}
        />
      </View>
    </View>
  );
}
