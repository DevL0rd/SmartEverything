import { useSession } from '../../store/selectors';
import { rowsOf } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';

export function useMayChoosePerson(): boolean {
  const own = useSession().client.id;
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.clients).some((client) => client.id === own && client.role === 'owner'),
    Object.is,
    [own],
  );
}
