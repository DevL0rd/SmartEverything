package expo.modules.healthconnect.listening

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceGateFixtureTest {
  private val sampleRate = 16_000
  private val frame = VoiceGate.FRAME_SAMPLES

  private fun fixture(name: String): ShortArray {
    val bytes = File("$FIXTURES/$name.pcm").readBytes()
    val out = ShortArray(bytes.size / 2)
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(out)
    return out
  }

  private fun padded(name: String): ShortArray {
    val speech = fixture(name)
    return ShortArray(sampleRate + speech.size + sampleRate * 2).also { speech.copyInto(it, sampleRate) }
  }

  private fun voicedFrames(pcm: ShortArray): List<Boolean> =
    (0 until pcm.size / frame).map { LevelOf.dbfs(pcm.copyOfRange(it * frame, (it + 1) * frame)) > VOICE_DBFS }

  private fun fedPositions(pcm: ShortArray, chunk: Int): List<Int> {
    val fedAt = ArrayList<Int>()
    var position = 0
    val gate = VoiceGate(
      { block -> LevelOf.dbfs(block) > VOICE_DBFS },
      ListeningCounters({ 0 }, {}),
      {},
      { block -> repeat(block.size) { fedAt.add(position - block.size + it) } }
    )
    var offset = 0
    while (offset < pcm.size) {
      position = minOf(offset + chunk, pcm.size)
      gate.hear(pcm.copyOfRange(offset, position))
      offset = position
    }
    return fedAt
  }

  @Test
  fun `every fixture keeps all of its voice and gates off the silence`() {
    val names = listOf("hw_jarvis", "hw_us1", "hw_gb2", "far_hw_us", "far_quiet_hw_us", "nm_coord")
    for (name in names) {
      val pcm = padded(name)
      val voiced = voicedFrames(pcm)
      val first = voiced.indexOf(true) * frame
      val last = (voiced.lastIndexOf(true) + 1) * frame
      val fedAt = fedPositions(pcm, chunk = 320)
      val fed = fedAt.toSet()
      val lost = (first until last).count { it !in fed }
      val lead = first - (fedAt.firstOrNull() ?: first)
      val gated = 100.0 * (pcm.size - fedAt.size) / pcm.size
      println("gate $name: voice ${first / 16}-${last / 16} ms, lost $lost samples, lead $lead samples, gated off ${"%.0f".format(gated)} percent")
      assertEquals("$name lost voice", 0, lost)
      assertTrue("$name preroll", lead >= 0)
      assertTrue("$name gated", gated > 20.0)
    }
  }

  companion object {
    private const val FIXTURES = "../../../../hub/test/assistant/fixtures"
    private const val VOICE_DBFS = -45.0
  }
}
