package expo.modules.healthconnect.planner

import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.IngestUnavailable
import java.io.File
import java.io.OutputStream
import java.nio.file.Files
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RingFilesTest {
  private val directory: File = Files.createTempDirectory("ring-files").toFile()
  private val fetched = mutableListOf<String>()
  private var failure: Exception? = null

  private val cache = RingFileCache(directory) { itemId, sink: OutputStream ->
    failure?.let { throw it }
    fetched += itemId
    sink.write("audio-$itemId".toByteArray())
  }

  @After fun cleanUp() {
    directory.deleteRecursively()
  }

  private fun file(id: String, etag: String = "v1") = RingSound.File(id, "$id.mp3", etag)

  @Test fun theCacheNameIsStableAndChangesWithTheEtag() {
    assertEquals(RingFiles.nameOf("a", "v1"), RingFiles.nameOf("a", "v1"))
    assertNotEquals(RingFiles.nameOf("a", "v1"), RingFiles.nameOf("a", "v2"))
    assertNotEquals(RingFiles.nameOf("a", "v1"), RingFiles.nameOf("b", "v1"))
    assertEquals(64, RingFiles.nameOf("a", "v1").length)
  }

  @Test fun theHubDownloadPathIsTheDriveFileRoute() {
    assertEquals("/media/drive/abc/file", RingFiles.pathOf("abc"))
  }

  @Test fun onlyFileSoundsAreWantedFromARingSet() {
    val rings = listOf(
      PhoneRing("a", RingKind.ALARM, "r", Instant.EPOCH, file("one"), 0, true, null, null),
      PhoneRing("b", RingKind.ALARM, "r", Instant.EPOCH, RingSound.Tone("default"), 0, true, null, null),
      PhoneRing("c", RingKind.ALARM, "r", Instant.EPOCH, RingSound.Radio("s", "n", "https://x.example"), 0, true, null, null)
    )
    assertEquals(listOf("one"), RingFiles.wanted(rings).map { it.itemId })
  }

  @Test fun aSyncDownloadsMissingFilesOnceAndServesThemFromTheCache() {
    val sound = file("one")
    assertNull(cache.pathOf(sound))
    assertFalse(runBlocking { cache.sync(listOf(sound, sound)) })
    assertEquals(listOf("one"), fetched)
    assertEquals("audio-one", File(cache.pathOf(sound)!!).readText())
    assertFalse(runBlocking { cache.sync(listOf(sound)) })
    assertEquals(listOf("one"), fetched)
  }

  @Test fun aChangedEtagDownloadsAgainAndDropsTheOldFile() {
    val old = file("one", "v1")
    val fresh = file("one", "v2")
    runBlocking { cache.sync(listOf(old)) }
    runBlocking { cache.sync(listOf(fresh)) }
    assertNull(cache.pathOf(old))
    assertNotNull(cache.pathOf(fresh))
    assertEquals(listOf("one", "one"), fetched)
  }

  @Test fun filesNoRingWantsAnyMoreAreRemoved() {
    runBlocking { cache.sync(listOf(file("one"), file("two"))) }
    runBlocking { cache.sync(listOf(file("two"))) }
    assertNull(cache.pathOf(file("one")))
    assertNotNull(cache.pathOf(file("two")))
    assertEquals(1, directory.listFiles().orEmpty().size)
  }

  @Test fun anUnreachableHubAsksForARetryAndLeavesNoPartialFile() {
    failure = IngestUnavailable("offline")
    assertTrue(runBlocking { cache.sync(listOf(file("one"))) })
    assertNull(cache.pathOf(file("one")))
    assertEquals(0, directory.listFiles().orEmpty().size)
  }

  @Test fun aRefusedFileIsSkippedWithoutARetry() {
    failure = IngestRejected(404, "gone")
    assertFalse(runBlocking { cache.sync(listOf(file("one"))) })
    assertNull(cache.pathOf(file("one")))
  }
}
