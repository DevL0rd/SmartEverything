package expo.modules.healthconnect.voice

import android.content.Context
import android.os.SystemClock
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class SpeechGateVectorTest(private val name: String, private val case: JSONObject) {
  private var now = START_MS
  private var frame = 0

  @Before
  fun setUp() {
    mockkStatic(SystemClock::class)
    every { SystemClock.elapsedRealtime() } answers { now }
    FakeVad.heardSpeech = false
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `the gate opens and closes on the frames the shared vector names`() {
    assertEquals(name, expected(), run())
  }

  private fun run(): List<String> {
    val settings = case.getJSONObject("settings")
    val observed = mutableListOf<String>()
    val sink = object : SpeechGateSink {
      override fun start() {
        observed.add("$frame open")
      }

      override fun packet(packet: ByteArray) = Unit

      override fun end() {
        observed.add("$frame close")
      }
    }
    var audible = false
    val gate = SpeechGate(mockk<Context>(relaxed = true), sink, { audible }, gateSettings(settings), ::FakeVad)
    val confirmAt = settings.getInt("minSpeechMs") / FRAME_MS
    var voicedRun = 0
    for (spec in objects(case.getJSONArray("frames"))) {
      val amplitude = (spec.getDouble("level") * FULL_SCALE).toInt().toShort()
      repeat(spec.getInt("count")) {
        val voiced = spec.getBoolean("voiced")
        voicedRun = if (voiced) voicedRun + 1 else 0
        FakeVad.heardSpeech = voiced && voicedRun > confirmAt
        audible = spec.getBoolean("audible")
        gate.hear(ShortArray(FRAME_INPUT_SAMPLES) { amplitude })
        now += FRAME_MS
        frame += 1
      }
    }
    return observed
  }

  private fun expected(): List<String> =
    objects(case.getJSONArray("events")).map { "${it.getInt("frame")} ${it.getString("event")}" }

  private fun gateSettings(settings: JSONObject) = GateSettings(
    echoTailMs = settings.getLong("echoTailMs"),
    sustainMs = settings.getInt("sustainMs"),
    bargeInLevel = settings.getDouble("bargeInLevel"),
    ignoreAssistantAudible = settings.getBoolean("ignoreAssistantAudible"),
    aggressiveWhileAudible = true,
    interruptible = settings.getBoolean("interruptible"),
    speechThreshold = 0.5,
    minSpeechMs = settings.getInt("minSpeechMs"),
    pauseMs = 200
  )

  companion object {
    private const val VECTOR = "../../../../../packages/domain/test/fixtures/speech-gate-vector.json"
    private const val START_MS = 10_000L
    private const val FRAME_MS = 32
    private const val FRAME_INPUT_SAMPLES = 512 * 3
    private const val FULL_SCALE = 32_768

    @JvmStatic
    @Parameterized.Parameters(name = "{0}")
    fun cases(): List<Array<Any>> =
      objects(JSONObject(File(VECTOR).readText()).getJSONArray("cases")).map { arrayOf(it.getString("name"), it) }

    private fun objects(array: JSONArray): List<JSONObject> = (0 until array.length()).map { array.getJSONObject(it) }
  }
}
