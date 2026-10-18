package expo.modules.healthconnect.voice

import android.content.Context
import android.os.SystemClock
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SpeechGateTest {
  private val events = mutableListOf<String>()
  private val sink = object : SpeechGateSink {
    override fun start() {
      events.add("start")
    }

    override fun packet(packet: ByteArray) {
      events.add("packet${packet.single()}")
    }

    override fun end() {
      events.add("end")
    }
  }
  private var now = 10_000L
  private var audible = false

  @Before
  fun setUp() {
    mockkStatic(SystemClock::class)
    every { SystemClock.elapsedRealtime() } answers { now }
    FakeVad.heardSpeech = false
    FakeVad.closed = false
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `speech in a quiet room opens the gate and replays the preroll first`() {
    val gate = gate()
    gate.packet(byteArrayOf(1))
    gate.packet(byteArrayOf(2))
    frames(gate, speech = true, count = 1)
    gate.packet(byteArrayOf(3))
    assertEquals(listOf("start", "packet1", "packet2", "packet3"), events)
  }

  @Test
  fun `the end of speech closes the gate once`() {
    val gate = gate()
    frames(gate, speech = true, count = 2)
    frames(gate, speech = false, count = 3)
    assertEquals(listOf("start", "end"), events)
  }

  @Test
  fun `the preroll keeps only the newest 32 packets`() {
    val gate = gate()
    (1..40).forEach { gate.packet(byteArrayOf(it.toByte())) }
    frames(gate, speech = true, count = 1)
    assertEquals("packet9", events[1])
    assertEquals(33, events.size)
  }

  @Test
  fun `packets before any speech are not forwarded`() {
    gate().packet(byteArrayOf(1))
    assertTrue(events.isEmpty())
  }

  @Test
  fun `speech heard while the assistant is audible does not open the gate when it is quiet`() {
    val gate = gate()
    audible = true
    frames(gate, speech = true, count = 20, amplitude = QUIET)
    assertTrue(events.isEmpty())
  }

  @Test
  fun `loud speech over the assistant barges in after the sustain time`() {
    val gate = gate()
    audible = true
    frames(gate, speech = true, count = 5, amplitude = LOUD)
    assertTrue(events.isEmpty())
    frames(gate, speech = true, count = 1, amplitude = LOUD)
    assertEquals(listOf("start"), events)
  }

  @Test
  fun `barge in never happens when interruption is off`() {
    val gate = gate(settings(interruptible = false))
    audible = true
    frames(gate, speech = true, count = 20, amplitude = LOUD)
    assertTrue(events.isEmpty())
  }

  @Test
  fun `speech that began over the assistant stays blocked after it falls silent until the next utterance`() {
    val gate = gate()
    audible = true
    frames(gate, speech = true, count = 1, amplitude = QUIET)
    audible = false
    now += 1_000
    frames(gate, speech = true, count = 3, amplitude = QUIET)
    assertTrue(events.isEmpty())
    frames(gate, speech = false, count = 1)
    frames(gate, speech = true, count = 1, amplitude = QUIET)
    assertEquals(listOf("start"), events)
  }

  @Test
  fun `ignoring the assistant opens the gate even while it is audible`() {
    val gate = gate(settings(ignoreAssistantAudible = true))
    audible = true
    frames(gate, speech = true, count = 1, amplitude = QUIET)
    assertEquals(listOf("start"), events)
  }

  @Test
  fun `reset ends an open utterance and forgets the preroll`() {
    val gate = gate()
    gate.packet(byteArrayOf(1))
    frames(gate, speech = true, count = 1)
    gate.reset()
    gate.packet(byteArrayOf(2))
    frames(gate, speech = true, count = 1)
    assertEquals(listOf("start", "packet1", "end", "start", "packet2"), events)
  }

  @Test
  fun `close ends an open utterance and releases the detector`() {
    val gate = gate()
    frames(gate, speech = true, count = 1)
    gate.close()
    assertEquals(listOf("start", "end"), events)
    assertTrue(FakeVad.closed)
  }

  @Test
  fun `loud speech that began over the assistant barges in after it falls silent`() {
    val gate = gate()
    audible = true
    frames(gate, speech = true, count = 1, amplitude = LOUD)
    audible = false
    now += 1_000
    frames(gate, speech = true, count = 7, amplitude = LOUD)
    assertEquals(listOf("start"), events)
  }

  @Test
  fun `the detection mode is the first library mode at or above the threshold the app sent`() {
    val modes = listOf(0.25 to VadMode.NORMAL, 0.5 to VadMode.NORMAL, 0.65 to VadMode.AGGRESSIVE, 0.9 to VadMode.VERY_AGGRESSIVE)
    modes.forEach { (threshold, expected) ->
      frames(gate(settings(speechThreshold = threshold)), speech = false, count = 1)
      assertEquals("threshold $threshold", expected, FakeVad.lastMode)
    }
  }

  @Test
  fun `speech over the assistant raises the mode to aggressive only when the settings ask for it`() {
    audible = true
    frames(gate(settings(speechThreshold = 0.25)), speech = false, count = 1)
    assertEquals(VadMode.AGGRESSIVE, FakeVad.lastMode)
    frames(gate(settings(speechThreshold = 0.25, aggressiveWhileAudible = false)), speech = false, count = 1)
    assertEquals(VadMode.NORMAL, FakeVad.lastMode)
  }

  @Test
  fun `a threshold below the lowest library mode boosts the input by the ratio`() {
    frames(gate(settings(speechThreshold = 0.25)), speech = false, count = 1, amplitude = QUIET)
    assertEquals(200, FakeVad.lastFrame.first().toInt())
    frames(gate(settings(speechThreshold = 0.5)), speech = false, count = 1, amplitude = QUIET)
    assertEquals(100, FakeVad.lastFrame.first().toInt())
  }

  private fun gate(settings: GateSettings = settings()): SpeechGate =
    SpeechGate(mockk<Context>(relaxed = true), sink, { audible }, settings, ::FakeVad)

  private fun settings(
    interruptible: Boolean = true,
    ignoreAssistantAudible: Boolean = false,
    speechThreshold: Double = 0.5,
    aggressiveWhileAudible: Boolean = true
  ) = GateSettings(
    echoTailMs = 300,
    sustainMs = 256,
    bargeInLevel = 0.04,
    ignoreAssistantAudible = ignoreAssistantAudible,
    aggressiveWhileAudible = aggressiveWhileAudible,
    interruptible = interruptible,
    speechThreshold = speechThreshold,
    minSpeechMs = 64,
    pauseMs = 200
  )

  private fun frames(gate: SpeechGate, speech: Boolean, count: Int, amplitude: Short = QUIET) {
    FakeVad.heardSpeech = speech
    repeat(count) {
      gate.hear(ShortArray(FRAME_INPUT_SAMPLES) { amplitude })
      now += FRAME_MS
    }
  }

  private companion object {
    const val FRAME_INPUT_SAMPLES = 512 * 3
    const val FRAME_MS = 32L
    const val QUIET: Short = 100
    const val LOUD: Short = 5_000
  }
}
