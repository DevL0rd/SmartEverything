package expo.modules.healthconnect.drive

import expo.modules.healthconnect.HubJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveModelTest {
  private val folder = """
    {"id":"11111111-1111-4111-8111-111111111111","rootId":"22222222-2222-4222-8222-222222222222","parentId":null,
     "relPath":"Docs","kind":"folder","name":"Docs","modifiedAt":"2026-11-14T10:00:00+07:00","rev":2,"locked":false,
     "childCount":3,"bytes":4096,"colour":null,"iconHint":false}
  """
  private val file = """
    {"id":"33333333-3333-4333-8333-333333333333","rootId":"22222222-2222-4222-8222-222222222222",
     "parentId":"11111111-1111-4111-8111-111111111111","kind":"document","name":"plan.pdf","modifiedAt":"2026-11-14T03:00:00Z",
     "rev":5,"locked":true,"mime":"application/pdf","bytes":2048,"thumb":{"state":"ready"}}
  """

  @Test
  fun `a browse page decodes folders and files with unknown fields ignored`() {
    val page = HubJson.decode<DriveBrowsePageDto>("""{"folder":$folder,"items":[$file],"shortcuts":[],"next":null}""")
    assertTrue(page.folder?.folder == true)
    assertEquals(1, page.items.size)
    assertNull(page.next)
  }

  @Test
  fun `a file converts to a cached row with its size mime lock and thumbnail`() {
    val item = HubJson.decode<DriveItemDto>(file).cached(DriveAccess.VIEW)
    assertEquals("plan.pdf", item.name)
    assertEquals("application/pdf", item.mime)
    assertEquals(2048L, item.bytes)
    assertTrue(item.locked)
    assertTrue(item.thumb)
    assertFalse(item.folder)
    assertEquals(5, item.rev)
    assertEquals(DriveAccess.VIEW, item.access)
    assertEquals(1_794_625_200_000L, item.modifiedMs)
  }

  @Test
  fun `a folder has no size in the provider and its offset time parses`() {
    val item = HubJson.decode<DriveItemDto>(folder).cached(DriveAccess.OWN)
    assertTrue(item.folder)
    assertEquals(0L, item.bytes)
    assertNull(item.mime)
    assertEquals(1_794_625_200_000L, item.modifiedMs)
  }

  @Test
  fun `a shared entry carries the grant role`() {
    val page = HubJson.decode<DriveSharedPageDto>(
      """{"items":[{"item":$file,"grant":{"id":"x","role":"view"}}],"next":"abc"}""",
    )
    assertEquals("view", page.items.single().grant.role)
    assertEquals("abc", page.next)
  }

  @Test
  fun `a recent page decodes opened, added and shortcut entries and shows the shortcut target`() {
    val shortcut = """
      {"kind":"shortcut","at":"2026-11-14T05:00:00Z","actorProfileId":"44444444-4444-4444-8444-444444444444",
       "via":"ai","deviceId":null,"shortcut":{"id":"55555555-5555-4555-8555-555555555555",
       "rootId":"22222222-2222-4222-8222-222222222222","parentId":null,"name":"Plan",
       "createdBy":"44444444-4444-4444-8444-444444444444","createdAt":"2026-11-14T05:00:00Z",
       "target":{"state":"available","item":$file}}}
    """
    val page = HubJson.decode<DriveRecentPageDto>(
      """{"entries":[$shortcut,
        {"kind":"opened","item":$folder,"at":"2026-11-14T04:00:00Z"},
        {"kind":"added","item":$file,"at":"2026-11-14T03:00:00Z","actorProfileId":null,"via":"share","deviceId":null}],
        "next":null}""",
    )
    val (first, second, third) = page.entries
    val made = first as DriveRecentEntryDto.Shortcut
    assertEquals("ai", made.via)
    assertEquals("55555555-5555-4555-8555-555555555555", made.shortcut.id)
    assertEquals("plan.pdf", made.shown?.name)
    assertTrue(second is DriveRecentEntryDto.Opened)
    assertEquals("Docs", second.shown?.name)
    assertEquals("share", (third as DriveRecentEntryDto.Added).via)
  }

  @Test
  fun `the cache is stale when never loaded or thirty seconds old`() {
    assertTrue(DriveCacheRules.stale(null, 1_000))
    assertFalse(DriveCacheRules.stale(1_000, 1_000 + DriveCacheRules.FRESH_MS - 1))
    assertTrue(DriveCacheRules.stale(1_000, 1_000 + DriveCacheRules.FRESH_MS))
  }

  @Test
  fun `the shared drive is writable by everyone who sees it and a personal drive by its owner`() {
    assertEquals(DriveAccess.SHARED, DriveCacheRules.access(DriveRootDto("r", "home")))
    assertEquals(DriveAccess.OWN, DriveCacheRules.access(DriveRootDto("r", "person", "p")))
  }
}
