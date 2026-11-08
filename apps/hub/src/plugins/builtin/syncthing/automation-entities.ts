import { entity } from '../automation-kit';

const PLUGIN = 'syncthing';

export const FOLDER = entity(PLUGIN, {
  id: 'folder',
  title: 'Synced folder',
  plural: 'Synced folders',
  options: 'folders',
});

export const PEER = entity(PLUGIN, {
  id: 'peer',
  title: 'Sync device',
  plural: 'Sync devices',
  options: 'peers',
});

export const INVITE = entity(PLUGIN, {
  id: 'invite',
  title: 'Syncthing invitation',
  plural: 'Syncthing invitations',
  options: 'invites',
});

export const SYNCTHING_ENTITIES = [FOLDER, PEER, INVITE] as const;
