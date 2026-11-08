package expo.modules.healthconnect.network

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidUpdateInstallerTest {
  private val application = "com.example.app"
  private val context = mockk<Context> { every { packageName } returns application }
  private val offer = AndroidUpdateRequest(
    "0".repeat(64),
    "594da1d3-d893-4850-8a70-b8f2eb4d305e",
    application,
    2,
    3,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )
  private val events = mutableListOf<Map<String, Any>>()
  private val progress = AndroidUpdateProgress(offer.id, offer.size) { events += it }

  @Test
  fun `parses a request with exactly the contract keys`() {
    val parsed = AndroidUpdateRequest.parse(json())
    assertEquals(offer, parsed)
  }

  @Test
  fun `names the missing request key`() {
    val failure = assertThrows(IllegalArgumentException::class.java) {
      AndroidUpdateRequest.parse(json().replace("\"size\":3,", ""))
    }
    assertTrue(failure.message.orEmpty().contains("missing: [size]"))
  }

  @Test
  fun `names an unexpected build key`() {
    val failure = assertThrows(IllegalArgumentException::class.java) {
      AndroidUpdateRequest.parse(json().replace("\"versionCode\":\"2\"", "\"versionCode\":\"2\",\"abi\":\"x\""))
    }
    assertTrue(failure.message.orEmpty().contains("build keys"))
    assertTrue(failure.message.orEmpty().contains("unexpected: [abi]"))
  }

  @Test
  fun `refuses a different application or a wrong type or length`() {
    val mime = AndroidUpdateInstaller.APK_MIME
    assertThrows(IllegalArgumentException::class.java) {
      AndroidUpdateInstaller.admit(context, offer.copy(applicationId = "other"), mime, 3)
    }
    assertThrows(IllegalArgumentException::class.java) { AndroidUpdateInstaller.admit(context, offer, "text/html", 3) }
    assertThrows(IllegalArgumentException::class.java) { AndroidUpdateInstaller.admit(context, offer, mime, 4) }
    AndroidUpdateInstaller.admit(context, offer, mime, -1)
    AndroidUpdateInstaller.admit(context, offer, mime, 3)
  }

  @Test
  fun `hashes while writing into the session and syncs after the digest matches`() {
    val session = mockk<PackageInstaller.Session>()
    val output = ByteArrayOutputStream()
    every { session.openWrite("base.apk", 0, offer.size) } returns output
    every { session.fsync(output) } answers { assertEquals("abc", output.toString(Charsets.UTF_8.name())) }

    AndroidUpdateInstaller.stream(session, ByteArrayInputStream("abc".toByteArray()), offer, progress) {}

    verify(exactly = 1) { session.fsync(output) }
    assertEquals(listOf("downloading", "downloading", "verifying"), events.map { it["stage"] })
    assertEquals(3L, events.last()["received"])
  }

  @Test
  fun `rejects changed bytes before syncing so the session is abandoned`() {
    val session = mockk<PackageInstaller.Session>()
    val output = ByteArrayOutputStream()
    every { session.openWrite("base.apk", 0, offer.size) } returns output

    val failure = assertThrows(IllegalArgumentException::class.java) {
      AndroidUpdateInstaller.stream(session, ByteArrayInputStream("abd".toByteArray()), offer, progress) {}
    }

    assertEquals("Update checksum did not match its offer", failure.message)
    verify(exactly = 0) { session.fsync(output) }
  }

  @Test
  fun `rejects a body longer than the offer without writing it`() {
    val session = mockk<PackageInstaller.Session>()
    val output = ByteArrayOutputStream()
    every { session.openWrite("base.apk", 0, offer.size) } returns output

    assertThrows(IllegalArgumentException::class.java) {
      AndroidUpdateInstaller.stream(session, ByteArrayInputStream("abcd".toByteArray()), offer, progress) {}
    }

    assertEquals("abc", output.toString(Charsets.UTF_8.name()))
    verify(exactly = 0) { session.fsync(output) }
  }

  @Test
  fun `stops streaming without syncing if the grant is withdrawn`() {
    val session = mockk<PackageInstaller.Session>()
    val output = ByteArrayOutputStream()
    every { session.openWrite("base.apk", 0, offer.size) } returns output

    val failure = assertThrows(IOException::class.java) {
      AndroidUpdateInstaller.stream(session, ByteArrayInputStream("abc".toByteArray()), offer, progress) {
        if (output.size() > 0) throw IOException("Fixture grant was withdrawn")
      }
    }

    assertEquals("Fixture grant was withdrawn", failure.message)
    verify(exactly = 0) { session.fsync(output) }
  }

  @Test
  fun `reports each stage and each whole percent once`() {
    val reporter = AndroidUpdateProgress("id", 1000) { events += it }
    reporter.report(AndroidUpdateStage.DOWNLOADING, 0)
    reporter.report(AndroidUpdateStage.DOWNLOADING, 5)
    reporter.report(AndroidUpdateStage.DOWNLOADING, 10)
    reporter.report(AndroidUpdateStage.VERIFYING, 1000)
    reporter.report(AndroidUpdateStage.VERIFYING, 1000)
    assertEquals(listOf(0L, 10L, 1000L), events.map { it["received"] })
  }

  @Test
  fun `distinguishes successful cancelled and failed sessions with Android's reason`() {
    val noConfirmation = { _: Intent -> error("Unexpected confirmation") }
    assertEquals(AndroidUpdateOutcome.INSTALLED, handleAndroidUpdateStatus(status(PackageInstaller.STATUS_SUCCESS), noConfirmation))
    assertEquals(AndroidUpdateOutcome.CANCELLED, handleAndroidUpdateStatus(status(PackageInstaller.STATUS_FAILURE_ABORTED), noConfirmation))
    val failed = handleAndroidUpdateStatus(status(PackageInstaller.STATUS_FAILURE_STORAGE, "  Not enough space "), noConfirmation)
    assertEquals(mapOf("result" to "failed", "status" to PackageInstaller.STATUS_FAILURE_STORAGE, "message" to "Not enough space"), failed?.toMap())
    val bare = handleAndroidUpdateStatus(status(PackageInstaller.STATUS_FAILURE_CONFLICT, " "), noConfirmation)
    assertNull(bare?.message)
  }

  @Test
  fun `passes through Android's confirmation intent and waits for a terminal result`() {
    val confirmation = mockk<Intent>()
    val pending = status(PackageInstaller.STATUS_PENDING_USER_ACTION)
    every { pending.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) } returns confirmation
    var shown: Intent? = null
    assertNull(handleAndroidUpdateStatus(pending) { shown = it })
    assertSame(confirmation, shown)
  }

  private fun json(): String =
    """{"id":"${offer.id}","releaseId":"${offer.releaseId}","build":{"applicationId":"$application","versionCode":"2"},"size":3,"sha256":"${offer.sha256}"}"""

  private fun status(value: Int, message: String? = null): Intent = mockk {
    every { hasExtra(PackageInstaller.EXTRA_STATUS) } returns true
    every { getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE) } returns value
    every { getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) } returns message
  }
}
