package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import expo.modules.healthconnect.MemoryPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhoneReporterTest {
  private val preferences = MemoryPreferences()
  private val context = mockk<Context>()
  private val workManager = mockk<WorkManager>(relaxed = true)
  private val queued = mutableListOf<JSONObject>()
  private var readings = mapOf<String, Any?>("battery" to 80, "charging" to false)
  private var sections = mapOf<PhoneSection, JSONObject>()
  private var features: JSONArray? = JSONArray()
  private var actions: JSONArray? = JSONArray()
  private var permissions: JSONArray? = JSONArray()
  private var requests = mutableListOf<PhoneReadRequest>()

  @Before
  fun setUp() {
    every { context.getSharedPreferences(any(), any()) } returns preferences
    mockkObject(WorkManager.Companion, PhoneReadings, PhonePostWorker.Companion, PhoneDetailRegistry, PhoneFeatures, PhoneMachine, PhoneBodyFiles)
    every { WorkManager.getInstance(any<Context>()) } returns workManager
    every { PhoneBodyFiles.pruneUnreferenced(any(), any(), any()) } returns Unit
    every { PhoneReadings.read(any(), any()) } answers {
      requests.add(secondArg())
      readings
    }
    every { PhoneDetailRegistry.read(any(), any(), any()) } answers { PhoneDetailRead(emptyMap(), sections) }
    every { PhoneFeatures.read(any()) } answers { features ?: throw IllegalStateException("features unreadable") }
    every { PhoneMachine.actions(any()) } answers { actions ?: throw IllegalStateException("actions unreadable") }
    every { PhoneMachine.permissions(any()) } answers { permissions ?: throw IllegalStateException("permissions unreadable") }
    every { PhonePostWorker.reportRequest(any(), any()) } answers {
      queued.add(secondArg())
      mockk<OneTimeWorkRequest>()
    }
    PhoneStore(context).setEnabled(true)
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `nothing is queued while the phone report is switched off`() {
    PhoneStore(context).setEnabled(false)
    PhoneReporter.report(context)
    assertTrue(queued.isEmpty())
  }

  @Test
  fun `the first report carries every reading and the context`() {
    PhoneReporter.report(context)
    val values = queued.single().getJSONObject("values")
    assertEquals(80, values.getInt("battery"))
    assertFalse(values.getBoolean("charging"))
    assertEquals("unknown", values.getString("phone_context"))
    assertEquals(0, values.getInt("context_confidence"))
  }

  @Test
  fun `a later report carries only the readings that changed`() {
    PhoneReporter.report(context)
    readings = readings + ("battery" to 79)
    PhoneReporter.report(context)
    val values = queued.last().getJSONObject("values")
    assertEquals(2, queued.size)
    assertEquals(listOf("battery"), values.keys().asSequence().toList())
  }

  @Test
  fun `an unchanged phone queues nothing`() {
    PhoneReporter.report(context)
    PhoneReporter.report(context)
    assertEquals(1, queued.size)
  }

  @Test
  fun `events alone still produce a report with no values`() {
    PhoneReporter.report(context)
    val event = PhoneEvent.unlocked(Instant.parse("2026-01-01T00:00:00Z"))
    PhoneReporter.report(context, listOf(event))
    val report = queued.last()
    assertEquals(0, report.getJSONObject("values").length())
    assertEquals("phone_unlocked", report.getJSONArray("events").getJSONObject(0).getString("kind"))
  }

  @Test
  fun `a full report resends everything even when nothing changed`() {
    PhoneReporter.report(context)
    PhoneReporter.report(context, full = true)
    assertEquals(2, queued.size)
    assertTrue(queued.last().getJSONObject("values").has("battery"))
  }

  @Test
  fun `what was not queued is not marked as sent`() {
    every { PhonePostWorker.reportRequest(any(), any()) } throws IllegalStateException("too big")
    PhoneReporter.report(context)
    assertEquals(0, PhoneStore(context).sent().length())
    assertEquals(0, PhoneStore(context).sentParts().length())
    every { PhonePostWorker.reportRequest(any(), any()) } answers {
      queued.add(secondArg())
      mockk<OneTimeWorkRequest>()
    }
    PhoneReporter.report(context)
    assertTrue(PhoneStore(context).sent().has("battery"))
  }

  @Test
  fun `forgetting clears what was sent and cancels the queued report`() {
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 80))
    PhoneReporter.report(context)
    PhoneReporter.forget(context)
    assertEquals(0, PhoneStore(context).sent().length())
    assertEquals(0, PhoneStore(context).sentParts().length())
    verify { workManager.cancelUniqueWork("expo.modules.healthconnect.phone.report") }
  }

  @Test
  fun `forgetting also deletes the body files of the work it cancelled`() {
    PhoneReporter.forget(context)
    verify { PhoneBodyFiles.pruneUnreferenced(context, any(), 0L) }
  }

  @Test
  fun `a section is sent when it changes and left out while it stays the same`() {
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 80))
    PhoneReporter.report(context)
    assertEquals(80, queued.last().getJSONObject("detail").getJSONObject("power").getInt("level"))
    PhoneReporter.report(context)
    assertEquals(1, queued.size)
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 75), PhoneSection.ALARM to JSONObject().put("nextAt", JSONObject.NULL))
    PhoneReporter.report(context)
    assertEquals(listOf("alarm", "power"), queued.last().getJSONObject("detail").keys().asSequence().toList().sorted())
  }

  @Test
  fun `an unchanged section is not repeated when another one changes`() {
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 80), PhoneSection.ALARM to JSONObject().put("nextAt", JSONObject.NULL))
    PhoneReporter.report(context)
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 75), PhoneSection.ALARM to JSONObject().put("nextAt", JSONObject.NULL))
    PhoneReporter.report(context)
    assertEquals(listOf("power"), queued.last().getJSONObject("detail").keys().asSequence().toList())
  }

  @Test
  fun `a full report resends every section`() {
    sections = mapOf(PhoneSection.POWER to JSONObject().put("level", 80))
    PhoneReporter.report(context)
    PhoneReporter.report(context, full = true)
    assertEquals(2, queued.size)
    assertTrue(queued.last().getJSONObject("detail").has("power"))
  }

  @Test
  fun `a report without section changes has no detail`() {
    PhoneReporter.report(context)
    assertFalse(queued.single().has("detail"))
  }

  @Test
  fun `the feature list is sent once and again when it changes`() {
    features = JSONArray().put(JSONObject().put("feature", "torch").put("state", "ready"))
    PhoneReporter.report(context)
    assertEquals("torch", queued.last().getJSONArray("features").getJSONObject(0).getString("feature"))
    PhoneReporter.report(context)
    assertEquals(1, queued.size)
    features = JSONArray().put(JSONObject().put("feature", "torch").put("state", "unsupported").put("reason", "No flashlight"))
    PhoneReporter.report(context)
    assertEquals("unsupported", queued.last().getJSONArray("features").getJSONObject(0).getString("state"))
  }

  @Test
  fun `the actions and permissions are sent once and again when either changes`() {
    actions = JSONArray().put(JSONObject().put("action", "lock").put("state", "ready"))
    permissions = JSONArray().put(JSONObject().put("permission", "android_accessibility").put("granted", true))
    PhoneReporter.report(context)
    assertEquals("lock", queued.last().getJSONArray("actions").getJSONObject(0).getString("action"))
    assertTrue(queued.last().getJSONArray("permissions").getJSONObject(0).getBoolean("granted"))
    PhoneReporter.report(context)
    assertEquals(1, queued.size)
    permissions = JSONArray().put(JSONObject().put("permission", "android_accessibility").put("granted", false))
    PhoneReporter.report(context)
    assertFalse(queued.last().getJSONArray("permissions").getJSONObject(0).getBoolean("granted"))
    assertFalse(queued.last().has("actions"))
  }

  @Test
  fun `an unreadable action list does not stop the other lists or the readings`() {
    actions = null
    features = JSONArray().put(JSONObject().put("feature", "torch").put("state", "ready"))
    PhoneReporter.report(context)
    assertFalse(queued.single().has("actions"))
    assertEquals("torch", queued.single().getJSONArray("features").getJSONObject(0).getString("feature"))
    assertEquals(80, queued.single().getJSONObject("values").getInt("battery"))
  }

  @Test
  fun `an unreadable feature list does not stop the readings`() {
    features = null
    PhoneReporter.report(context)
    assertEquals(80, queued.single().getJSONObject("values").getInt("battery"))
    assertFalse(queued.single().has("features"))
  }

  @Test
  fun `a slow report asks for the slow readings and a plain one does not`() {
    PhoneReporter.report(context)
    PhoneReporter.report(context, slow = true)
    PhoneReporter.report(context, full = true)
    assertEquals(listOf(false, true, true), requests.map { it.slow })
  }

  @Test
  fun `the same digest is produced for the same text`() {
    assertEquals(PhoneReporter.digest("{\"a\":1}"), PhoneReporter.digest("{\"a\":1}"))
    assertFalse(PhoneReporter.digest("{\"a\":1}") == PhoneReporter.digest("{\"a\":2}"))
    assertEquals(64, PhoneReporter.digest("x").length)
  }
}
