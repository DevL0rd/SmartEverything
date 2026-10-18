import type { StoreContext } from '../../context';
import { AccessAuditRepository } from '../access-audit';
import { AccessRequestsRepository } from '../access-requests';
import { ClientsRepository } from '../clients';
import { OAuthRepository } from '../oauth';
import { PersonAccessRepository } from '../person-access';
import { PersonalRepository } from '../personal';
import { ProfilesRepository } from '../profiles';
import { ProvidersRepository } from '../providers';
import { TalkRepository } from '../talk';

export const peopleRepositories = (context: StoreContext) =>
  ({
    clients: new ClientsRepository(context),
    providers: new ProvidersRepository(context),
    profiles: new ProfilesRepository(context),
    personAccess: new PersonAccessRepository(context),
    accessAudit: new AccessAuditRepository(context),
    accessRequests: new AccessRequestsRepository(context),
    personal: new PersonalRepository(context),
    oauth: new OAuthRepository(context),
    talk: new TalkRepository(context),
  }) as const;
