import type { DriveFolderColour } from '@smarteverything/domain';
import type { StoreContext } from '../context';

export function folderColourOf(profile = '$viewer', item = 'i.id'): string {
  return `(select c.colour from drive_folder_colours c where c.item_id = ${item} and c.profile_id = ${profile})`;
}

export class DriveFolderColoursRepository {
  constructor(private readonly context: StoreContext) {}

  set(profileId: string, itemId: string, colour: DriveFolderColour | null): void {
    this.context.write(() => {
      if (colour === null) {
        this.context.sql.run(
          'clear the folder colour',
          'delete from drive_folder_colours where profile_id = $profileId and item_id = $itemId',
          { profileId, itemId },
        );
        return;
      }
      this.context.sql.run(
        'set the folder colour',
        `insert into drive_folder_colours (profile_id, item_id, colour)
          values ($profileId, $itemId, $colour)
          on conflict (profile_id, item_id) do update set colour = excluded.colour`,
        { profileId, itemId, colour },
      );
    });
  }
}
