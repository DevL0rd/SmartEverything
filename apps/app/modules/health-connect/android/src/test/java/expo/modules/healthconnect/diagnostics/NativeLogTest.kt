package expo.modules.healthconnect.diagnostics

import java.io.IOException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeLogTest {
  @After
  fun restore() {
    NativeLog.setLevel(NativeLevel.DEBUG)
  }

  private fun latest(event: String): Map<String, Any?>? =
    NativeLog.events.replayCache.lastOrNull { it["event"] == event }

  @Test
  fun `a record carries level scope event and a sequence`() {
    NativeLog.info("test-scope", "unit.recorded") { mapOf("count" to 3) }
    val entry = requireNotNull(latest("unit.recorded"))
    assertEquals("info", entry["level"])
    assertEquals("test-scope", entry["scope"])
    assertEquals(3, entry["count"])
    assertTrue(entry["seq"] is Long)
  }

  @Test
  fun `a disabled level never builds its payload`() {
    NativeLog.setLevel(NativeLevel.WARN)
    var built = false
    NativeLog.debug("test-scope", "unit.skipped") {
      built = true
      emptyMap()
    }
    assertFalse(built)
    assertNull(latest("unit.skipped"))
  }

  @Test
  fun `a failure is described without leaking addresses or urls`() {
    NativeLog.warn("test-scope", "unit.failed", IOException("connect to https://10.0.0.5:8443/api failed")) { emptyMap() }
    val entry = requireNotNull(latest("unit.failed"))
    assertEquals("IOException", entry["errorName"])
    val message = entry["errorMessage"] as String
    assertFalse(message.contains("10.0.0.5"))
    assertFalse(message.contains("https://"))
  }

  @Test
  fun `unsupported payload values become plain strings`() {
    NativeLog.info("test-scope", "unit.plain") { mapOf("value" to Thread.State.NEW, "list" to listOf(1, "a")) }
    val entry = requireNotNull(latest("unit.plain"))
    assertEquals("NEW", entry["value"])
    assertEquals(listOf(1, "a"), entry["list"])
  }

  @Test
  fun `route templates hide identifiers`() {
    assertEquals("/api/devices/:id/state", NativeLog.template("/api/devices/3f2a9c1e-77aa-4b12-9c11-0a1b2c3d4e5f/state?x=1"))
    assertEquals("/api/health/ingest", NativeLog.template("/api/health/ingest"))
  }

  @Test
  fun `scope labels keep only a short principal`() {
    assertEquals("native:server:abcdef12", NativeLog.scopeLabel("native:server:abcdef1234567890"))
  }

  @Test
  fun `a delivered entry is claimed once`() {
    NativeLog.info("test-scope", "unit.claimed")
    val entry = requireNotNull(latest("unit.claimed"))
    assertTrue(NativeLog.claim(entry))
    assertFalse(NativeLog.claim(entry))
  }

  @Test
  fun `a tally logs one summary per window`() {
    val tally = NativeTally("test-scope", "unit.summary", intervalMs = 0)
    tally.add(5)
    tally.add(7, ok = false)
    val summary = requireNotNull(latest("unit.summary"))
    assertEquals("debug", summary["level"])
  }
}
