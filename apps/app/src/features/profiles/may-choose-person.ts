import { useRows, useSession } from '../../store/selectors';

export function useMayChoosePerson(): boolean {
  const own = useSession().client.id;
  return useRows('clients').some((client) => client.id === own && client.role === 'owner');
}
