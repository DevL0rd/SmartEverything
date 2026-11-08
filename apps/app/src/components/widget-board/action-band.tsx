import { Children, createContext, use, type ReactNode } from 'react';
import { View } from 'react-native';
import { BandMember, useBandValue } from './band-context';

const Tail = createContext<ReactNode>(null);

export function ActionBandTail({
  tail,
  children,
}: {
  readonly tail: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return <Tail value={tail}>{children}</Tail>;
}

function Band({ items, tail }: { readonly items: ReactNode; readonly tail: ReactNode }): ReactNode {
  const band = useBandValue();
  return (
    <View
      className="mt-auto flex-row flex-wrap items-center justify-end gap-2"
      pointerEvents="box-none"
    >
      <BandMember value={band}>
        <Tail value={null}>
          {items}
          {tail}
        </Tail>
      </BandMember>
    </View>
  );
}

export function ActionBand({ children }: { readonly children?: ReactNode }): ReactNode {
  const tail = use(Tail);
  const items = Children.toArray(children);
  if (items.length === 0 && (tail === null || tail === undefined || tail === false)) {
    return null;
  }
  return <Band items={items} tail={tail} />;
}
