package expo.modules.healthconnect.phone

import android.content.Context
import io.mockk.mockk
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

private class FakeSource(
  override val sections: Set<PhoneSection>,
  private val made: MutableList<PhoneSection> = mutableListOf(),
  private val failing: Boolean = false,
  private val extra: Map<String, Any?> = emptyMap()
) : PhoneDetailSource {
  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> = extra

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? {
    check(!failing) { "the fake could not read" }
    made.add(section)
    return JSONObject().put("name", section.wire)
  }
}

class PhoneDetailTest {
  private val context = mockk<Context>()

  @Test
  fun `a fast section is wanted on every report`() {
    assertTrue(PhoneReadRequest(live = false, slow = false).wants(PhoneSection.POWER))
  }

  @Test
  fun `a slow section waits for a slow report`() {
    assertFalse(PhoneReadRequest(live = false, slow = false).wants(PhoneSection.STORAGE))
    assertTrue(PhoneReadRequest(live = false, slow = true).wants(PhoneSection.STORAGE))
  }

  @Test
  fun `a slow section that refreshes while live is wanted while live`() {
    assertTrue(PhoneReadRequest(live = true, slow = false).wants(PhoneSection.APPS))
    assertFalse(PhoneReadRequest(live = true, slow = false).wants(PhoneSection.STORAGE))
  }

  @Test
  fun `two sources producing one section are refused naming both`() {
    val failure = assertThrows(IllegalStateException::class.java) {
      PhoneDetailRegistry.checked(listOf(FakeSource(setOf(PhoneSection.POWER)), FakeSource(setOf(PhoneSection.POWER))))
    }
    assertTrue(failure.message.orEmpty().contains("power"))
    assertTrue(failure.message.orEmpty().contains("FakeSource"))
  }

  @Test
  fun `the real sources produce each section once`() {
    val sections = PhoneDetailRegistry.checked(listOf(PhonePower, PhoneSound, PhoneScreen, PhoneSignal, PhoneStorage, PhoneAlarm)).flatMap { it.sections }
    assertEquals(sections.toSet().size, sections.size)
    assertEquals(
      setOf(PhoneSection.POWER, PhoneSection.SOUND, PhoneSection.SCREEN, PhoneSection.NETWORK, PhoneSection.STORAGE, PhoneSection.ALARM),
      sections.toSet()
    )
  }

  @Test
  fun `reading asks only for the sections the request wants`() {
    val made = mutableListOf<PhoneSection>()
    val source = FakeSource(setOf(PhoneSection.POWER, PhoneSection.STORAGE), made, extra = mapOf("charger" to "ac"))
    val read = PhoneDetailRegistry.read(context, PhoneReadRequest(live = false, slow = false), listOf(source))
    assertEquals(listOf(PhoneSection.POWER), made)
    assertEquals(setOf(PhoneSection.POWER), read.sections.keys)
    assertEquals("ac", read.values["charger"])
  }

  @Test
  fun `a source that fails is skipped and the others still answer`() {
    val read = PhoneDetailRegistry.read(
      context,
      PhoneReadRequest(live = false, slow = false),
      listOf(FakeSource(setOf(PhoneSection.POWER), failing = true), FakeSource(setOf(PhoneSection.ALARM)))
    )
    assertEquals(setOf(PhoneSection.ALARM), read.sections.keys)
  }

  @Test
  fun `a guarded reading that fails gives nothing`() {
    assertNull(PhoneGuard.run("a test reading") { throw IllegalStateException("no") })
    assertEquals(3, PhoneGuard.run("a test reading") { 3 })
  }

  @Test
  fun `a slow reading is computed once until a fresh one is asked for`() {
    var calls = 0
    val reading = SlowReading<Int>()
    assertEquals(1, reading.read(false) { ++calls })
    assertEquals(1, reading.read(false) { ++calls })
    assertEquals(2, reading.read(true) { ++calls })
    assertEquals(2, reading.read(false) { ++calls })
  }

  @Test
  fun `every section has a distinct wire name`() {
    assertEquals(PhoneSection.entries.size, PhoneSection.entries.map { it.wire }.toSet().size)
    assertEquals(
      listOf("power", "sound", "screen", "network", "connections", "storage", "apps", "notifications", "alarm"),
      PhoneSection.entries.map { it.wire }
    )
  }
}
