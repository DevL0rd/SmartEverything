---
name: smarteverything-photos-drive
description: 'Reads and organises the person’s drive on the hub: Photos and Drive files, folders, albums, places, duplicates, trash, earlier versions, share links, sharing with people, folder placements on computers, conflicts and drive health. Use for “find the beach photos from last July”, “make an album of this trip”, “share this folder for a week”, “share this folder with Sam so she can edit”, “how much space is my drive using” or “what is still backing up”. Not for files on a computer (smarteverything-computers) or this chat’s project folder.'
---

# Photos and Drive

Every person has one personal drive (My Drive) in the hub's data folder, and the whole home shares one Shared Drive. Nobody sees another person's drive unless they shared an item with them. Photos is the same files seen as pictures and videos; Drive is the same files seen as folders. `drive_read` reads and `drive_edit` changes. Both take `personId` from `person_read`, but it must be the person you are talking to (left out means them): a drive is never read or changed for someone else, and that holds for the owner's AI too. The owner's AI reaches the owner's own drive, the Shared Drive and what was shared with the owner; for other people it can read only their space totals in `usage`. A refusal on a file that is not shared is final; say so and do not look for another route.

In the app, Photos is one Library page with a search bar and tabs: All, Favourites, Videos, Screenshots, Cameras, Made with AI and On this device. The Library holds the photos and videos under `Photos/` in the person’s own drive and the Shared Drive pictures that were kept there; photos are private to their person unless shared, the owner included. On this device is app-only: it shows this device’s local photos and videos (Pictures and Videos on desktop, the permitted media library on Android) without requiring backup, so `drive_read` never lists them. Backup is optional and copies originals into `Photos/` of the personal drive; its settings, and Duplicates, live in Settings › Photos. There are no memories: trip albums are an app feature only.

## Read before you change

`drive_read` takes a `view`:

- `drives` lists the drives you can open (your own and the Shared Drive) with state, size and health. `folder` lists one folder (`rootId` from `drives`, optional `folderId`, `sortField` with `sortDirection`, `cursor` for the next page). `item` gives one file or folder.
- `shared_with_me` lists the files and folders other people shared with you, with your role (view or edit) and who shared them. `shared_by_me` lists what you shared, with the people and the links.
- `search` finds files by `text`, `kinds` (image, video, audio, document, other), `starred`, `from` and `to` (days taken), inside a drive (`rootId`) or `folderId`, sorted by `sortField` and `sortDirection`.
- `library` is the Photos Library: without `month` it lists the months with counts, with `month` (YYYY-MM) one month page (`cursor` for the next page). It narrows by `libraryFilter` (all, favourites, videos, screenshots), `text`, `from` and `to` (days taken), `placeId`, `countryCode`, `camera` and `albumId`.
- `albums` (`surface` photos or drive) and `album` (`albumId`) list albums and their files. `places` lists where photos were taken, with `placeId` one place. `stacks` lists bursts and RAW plus JPEG pairs, with `stackId` one stack.
- `duplicates` groups files with identical content, `trash` lists what will leave for good and when, `recent` lists what was opened, added or changed (`filter` everything, opened, added or changed).
- `versions` lists the earlier versions of a file (`itemId`), `shares` the links made (optional `itemId`), `usage` your space (the owner also gets one totals row per person, never names of files), `stats` your drives by kind and folder, `health` whether files are intact and backed up, `placements` the folders placed on your computers (synced or mounted) with their state, `conflicts` the sync conflicts waiting, `backup` the backup progress of each device and how much room is left for it.

Pages carry a `next` value: pass it back as `cursor`. Ids from one read are what `drive_edit` takes.

## Change

`drive_edit` takes an `action`:

- Folders and files: `new_folder` (`parentId`, or `rootId` alone for the top of a drive, and `name`), `rename` (`itemId`, `name`), `move` and `copy` (`itemIds`, `toFolderId`), `star` (`itemIds`, `starred` false removes it), `trash` and `restore` (`itemIds`). Each answers with what was done, what failed and the names that already exist; read it and report the failures. A name that exists is never overwritten.
- Albums: `album_create` (`album` with kind manual or smart, `title`, `surface`, `scope`), `album_update` (`albumId`, `changes`), `album_add` and `album_remove` (`albumId`, `itemIds`). Deleting an album never deletes its files.
- `keep` (`source` cameras or ai, `itemIds`) keeps camera snapshots or Made with AI pictures in the Shared Drive so they stay.
- `attach_to_chat` (`itemId`) shows you one PNG, JPEG, GIF or WebP picture up to 4 MB so you can look at it. For a larger photo or any other file, say so and offer a link or open it for the person with `widget_show` kind photos.
- `version_restore` (`itemId`, `versionId`) brings back an earlier version; the current one is kept as a version.
- `share_create` (`share` with `itemId`, `permission` view or download, `expiresAt` or null, `password` or null) answers with the link, its end time and how to revoke it; tell the person all three, and suggest an end date unless they want none. `share_revoke` (`shareId`) stops a link at once. Never make a link the person did not ask for.
- `share_people` (`itemId`, `recipientId` (a person id from `person_read`), `role` view or edit, or none to stop sharing) shares a file or folder of your own drive with a person; a folder covers everything inside it, and only you, the drive's person, share it. This is different from `share_create`, which makes a public link.
- `placement_set` (`placement` with `deviceId`, `rootId`, `folderItemId` or null for the whole drive, `mode` synced or mounted, `localPath`, `enabled`, and for synced `excluded`, `ignorePatterns`, `conflictCopies`) places a drive folder on one of your computers, synced both ways or mounted as a disk; a folder shared with view only is placed read only. `placement_remove` (`placementId`) stops one; the files already on the computer stay.
- `configure` (`rootId`, `driveChanges` with `versions`, `skipPatterns`, `includeHidden`) changes a drive's settings, and `scan` (`rootId`) re-reads a drive from disk. You change your own drive; only the owner changes the Shared Drive. `conflict_resolve` (`conflictId`, `resolution` keep_hub, keep_client or keep_both) settles a sync conflict, and `scrub_start` (owner only) checks every file against its stored hash.

There are no extra drives and no folders to add: a person has their own drive and the home has the Shared Drive. A member's AI makes a share link only when the owner allows members to share; a refusal is final, so say which rule applied.

## What is not possible here

Permanent removal is not an AI action: `trash` moves files to Trash and only the person can empty it or delete for good in the app. The AI does not browse or write to Google Drive or Google Photos; the optional copy of a Google account is started by the person in the app.

## Show it

`widget_show` kind photos (`view` item, album or month, and `id`) puts a photo, an album or a month under your reply. Use ids from `drive_read`, and only when the person wants to see it, not for every search.

## Drive settings

`settings_read` lists `drive_settings` under changed_by. Upload expiry, member sharing, duplicate hashing and indexing are changed with `operation_call` updateDriveSettings (owner only); read the current values with readDriveSettings first and send only the fields that change.
