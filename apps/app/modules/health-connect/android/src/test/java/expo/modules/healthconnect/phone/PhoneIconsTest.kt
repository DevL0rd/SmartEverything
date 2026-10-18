package expo.modules.healthconnect.phone

import android.content.Context
import expo.modules.healthconnect.MemoryPreferences
import io.mockk.every
import io.mockk.mockk
import java.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneIconsTest {
  @Test
  fun `the hash is the lowercase SHA-256 of the image bytes`() {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", PhoneIcons.hashOf("abc".toByteArray()))
  }

  @Test
  fun `the upload body carries a 64 character hash and the bytes as base64`() {
    val bytes = byteArrayOf(1, 2, 3, 120, -5)
    val body = PhoneIcons.uploadBody(PhoneIcons.hashOf(bytes), bytes)
    assertTrue(Regex("^[0-9a-f]{64}$").matches(body.getString("hash")))
    assertArrayEquals(bytes, Base64.getDecoder().decode(body.getString("webpBase64")))
    assertEquals(setOf("hash", "webpBase64"), body.keys().asSequence().toSet())
  }

  private val preferences = MemoryPreferences()
  private val context = mockk<Context>().also { every { it.getSharedPreferences(any(), any()) } returns preferences }

  private fun known(packageName: String, updatedAt: Long, hash: String) {
    preferences.edit().putString("hash.$packageName", "$updatedAt:$hash").apply()
  }

  @Test
  fun `an icon the hub refused is missing again so the next sync sends it again`() {
    val apps = listOf(LaunchableApp("com.a", "A", 5L), LaunchableApp("com.b", "B", 6L), LaunchableApp("com.c", "C", 7L))
    known("com.a", 5L, "h1")
    known("com.b", 6L, "h1")
    known("com.c", 7L, "h2")
    assertEquals(emptyList<LaunchableApp>(), PhoneIcons.missing(context, apps))
    PhoneIcons.rejected(context, "h1")
    assertEquals(listOf("com.a", "com.b"), PhoneIcons.missing(context, apps).map { it.packageName })
    assertEquals("h2", PhoneIcons.hashFor(context, "com.c"))
  }

  @Test
  fun `an icon the hub accepted is remembered by its hash`() {
    PhoneIcons.uploaded(context, "h1")
    assertTrue(preferences.getBoolean("uploaded.h1", false))
  }
}
