---
name: smarteverything-photos-drive
description: 'Reads and organises the person’s library on the hub: Photos and Drive files, folders, albums, memories, places, duplicates, trash, earlier versions, share links, sync devices, conflicts and library health. Use for “find the beach photos from last July”, “make an album of this trip”, “share this folder for a week”, “how much space is the library using” or “what is still backing up”. Not for files on a computer (smarteverything-computers) or this chat’s project folder.'
---

# Photos and Drive

The library is the folders the hub indexes (library folders, called roots) plus the person's own space. Photos is the same library seen as a timeline of pictures and videos; Drive is the same files seen as folders. `drive_read` reads it and `drive_edit` changes it. Both take `personId` from `person_read` and act for the person you are talking to when it is left out. A member's AI reaches only that person's own files and the home's shared folders; the owner's reaches everything.

The app also shows this device’s local photos and videos without requiring backup: Pictures and Videos on desktop, and the permitted device media library on Android. Backup is optional and copies originals to the hub. Local items that have not been backed up are available in that device’s app; `drive_read` reads the hub library and backup progress.

## Read before you change

`drive_read` takes a `view`:

- `roots` lists library folders with state, size and health. `folder` lists one folder (`rootId`, optional `folderId`, `sortField` with `sortDirection`, `cursor` for the next page). `item` gives one file or folder.
- `search` finds files by `text`, `kinds` (image, video, audio, document, other), `starred`, `from` and `to` (days taken), inside a `rootId` or `folderId`, sorted by `sortField` and `sortDirection`.
- `timeline` gives the months with counts (`filter` all, favourites, videos or screenshots), or one month's photos when `month` is YYYY-MM; `placeId` narrows it to a place.
- `albums` (`surface` photos or drive) and `album` (`albumId`) list albums and their files. `memories` lists on this day, days out, bursts, trips and the year in review; with `memoryId` it lists that memory's photos. `places` lists where photos were taken, with `placeId` one place. `stacks` lists bursts and RAW plus JPEG pairs, with `stackId` one stack.
- `duplicates` groups files with identical content, `trash` lists what will leave for good and when, `recent` lists what was opened, added or changed (`filter` everything, opened, added or changed).
- `versions` lists the earlier versions of a file (`itemId`), `shares` the links made (optional `itemId`), `usage` the space each person uses, `stats` the library by kind and folder, `health` whether files are intact and backed up, `sync` the devices that sync a folder, `conflicts` the sync conflicts waiting, `backup` the progress of each device's photo and video backup.

Pages carry a `next` value: pass it back as `cursor`. Ids from one read are what `drive_edit` takes.

## Change

`drive_edit` takes an `action`:

- Folders and files: `new_folder` (`parentId`, `name`), `rename` (`itemId`, `name`), `move` and `copy` (`itemIds`, `toFolderId`), `star` (`itemIds`, `starred` false removes it), `trash` and `restore` (`itemIds`). Each answers with what was done, what failed and the names that already exist; read it and report the failures. A name that exists is never overwritten.
- Albums: `album_create` (`album` with kind manual or smart, `title`, `surface`, `scope`), `album_update` (`albumId`, `changes`), `album_add` and `album_remove` (`albumId`, `itemIds`), `make_memory_album` (`memoryId` from view memories and a `title`). Deleting an album never deletes its files.
- `keep` (`source` cameras or ai, `itemIds`) keeps camera snapshots or Made with AI pictures in the library so they stay.
- `attach_to_chat` (`itemId`) shows you one PNG, JPEG, GIF or WebP picture up to 4 MB so you can look at it. For a larger photo or any other file, say so and offer a link or open it for the person with `widget_show` kind photos.
- `version_restore` (`itemId`, `versionId`) brings back an earlier version; the current one is kept as a version.
- `share_create` (`share` with `itemId`, `permission` view or download, `expiresAt` or null, `password` or null) answers with the link, its end time and how to revoke it; tell the person all three, and suggest an end date unless they want none. `share_revoke` (`shareId`) stops a link at once. Never make a link the person did not ask for.
- `add_root` (`root`) adds a folder or disk on the hub as a library folder, `scan` (`rootId`) re-reads one from disk, `conflict_resolve` (`conflictId`, `resolution` keep_hub, keep_client or keep_both) settles a sync conflict, `sync_set` (`sync`) turns a device's sync on or off and picks its folders, `scrub_start` checks every file against its stored hash.

`add_root` is refused in plain words when the folder is the hub's own data or install folder, sits inside another library folder or cannot be read; tell the person the reason and do not look for another route. Adding a root and starting a scrub are the owner's, and a member's AI makes a share only when the owner allows members to share; a refusal is final, so say which rule applied.

## What is not possible here

Permanent removal is not an AI action: `trash` moves files to Trash and only the person can empty it or delete for good in the app. The AI does not browse or write to Google Drive or Google Photos; the optional copy of a Google account is started by the person in the app.

## Show it

`widget_show` kind photos (`view` item, album, memory or month, and `id`) puts a photo, an album, a memory or a month under your reply. Use ids from `drive_read`, and only when the person wants to see it, not for every search.

## Library settings

`settings_read` lists `drive_settings` under changed_by. Upload expiry, member sharing, duplicate hashing and indexing are changed with `operation_call` updateDriveSettings (owner only); read the current values with readDriveSettings first and send only the fields that change.
