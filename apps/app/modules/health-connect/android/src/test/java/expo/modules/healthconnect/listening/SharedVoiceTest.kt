package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.VoiceProbability
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.exp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedVoiceTest {
  private class Loudness : VoiceProbability {
    var computed = 0
    var resets = 0
    var closed = 0

    override fun probability(frame: ShortArray): Float {
      computed += 1
      return (1.0 / (1.0 + exp(-(LevelOf.dbfs(frame) + LOUDNESS_MIDPOINT) / LOUDNESS_SLOPE))).toFloat()
    }

    override fun reset() {
      resets += 1
    }

    override fun close() {
      closed += 1
    }
  }

  private fun fixture(name: String): ShortArray {
    val bytes = File("$FIXTURES/$name.pcm").readBytes()
    val out = ShortArray(bytes.size / 2)
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(out)
    return out
  }

  private fun recording(): ShortArray {
    var seed = NOISE_SEED
    val out = ArrayList<Short>()
    for ((index, name) in NAMES.withIndex()) {
      repeat(NOISE_SAMPLES + index * NOISE_STEP) {
        seed = seed * LCG_MULTIPLIER + LCG_INCREMENT
        out.add(((seed ushr NOISE_SHIFT) % NOISE_SPAN - NOISE_SPAN / 2).toShort())
      }
      fixture(name).forEach { out.add(it) }
    }
    return out.toShortArray()
  }

  private fun run(pauseMs: Int, chunk: Int, model: Loudness = Loudness()): List<String> {
    val pcm = recording()
    var heard = 0L
    val fed = ArrayList<Int>()
    var hash = HASH_SEED
    var restarts = 0
    val opened = ArrayList<Int>()
    val cut = ArrayList<String>()
    val voice = VoiceFrames(model)
    val gate = VoiceGate(
      ListeningCounters({ 0 }, {}),
      { restarts += 1 },
      { block ->
        fed.add(block.size)
        block.forEach { hash = hash * HASH_PRIME + it }
      },
      opened = { opened.add(it) }
    )
    val deliver: (Segment) -> Unit = { segment ->
      val digest = segment.pcm.fold(SEGMENT_SEED) { sum, sample -> sum * HASH_PRIME + sample }
      cut.add("${segment.startedAtMs}-${segment.endedAtMs}:${segment.pcm.size}:$digest")
    }
    var segments = EarSegments(pauseMs, deliver, { heard / SAMPLES_PER_MS })
    var offset = 0
    var rested = false
    while (offset < pcm.size) {
      val end = minOf(offset + chunk, pcm.size)
      val block = pcm.copyOfRange(offset, end)
      heard += block.size
      val frames = voice.split(block)
      gate.hear(block, frames)
      segments.hear(frames)
      offset = end
      if (!rested && offset >= pcm.size / 2) {
        rested = true
        segments.close()
        gate.rest()
        offset += PAUSE_GAP
        voice.restart()
        segments = EarSegments(pauseMs, deliver, { heard / SAMPLES_PER_MS })
      }
    }
    segments.close()
    voice.close()
    return listOf("wake fed=${fed.sum()} chunks=${fed.size} hash=$hash restarts=$restarts opened=$opened", "segments=${cut.size} ${cut.joinToString(";")}")
  }

  @Test
  fun `one shared detector gives the wake gate and the write-down the decisions they made with their own detectors`() {
    assertEquals(BEFORE_640_320, run(640, 320))
    assertEquals(BEFORE_2500_1000, run(2500, 1000))
  }

  @Test
  fun `the model runs once per frame whatever the number of consumers`() {
    val model = Loudness()
    run(640, 320, model)
    val frames = (recording().size - PAUSE_GAP) / VoiceFrames.FRAME_SAMPLES
    assertTrue("computed ${model.computed} of about $frames frames", model.computed in frames - 1..frames)
    assertEquals(1, model.resets)
    assertEquals(1, model.closed)
  }

  @Test
  fun `restarting drops a half frame and resets the model`() {
    val model = Loudness()
    val voice = VoiceFrames(model)
    assertEquals(0, voice.split(ShortArray(300)).size)
    voice.restart()
    assertEquals(0, voice.split(ShortArray(300)).size)
    assertEquals(1, voice.split(ShortArray(212)).size)
    assertEquals(1, model.resets)
    assertEquals(1, model.computed)
  }

  @Test
  fun `every consumer sees the same frame audio and probability`() {
    val voice = VoiceFrames(Loudness())
    val pcm = ShortArray(VoiceFrames.FRAME_SAMPLES * 2 + 100) { (it % 97 * 300).toShort() }
    val frames = voice.split(pcm)
    assertEquals(2, frames.size)
    assertEquals(pcm.copyOfRange(VoiceFrames.FRAME_SAMPLES, VoiceFrames.FRAME_SAMPLES * 2).toList(), frames[1].pcm.toList())
  }

  @Test
  fun `a closed detector releases the model once and hears nothing more`() {
    val model = Loudness()
    val voice = VoiceFrames(model)
    voice.close()
    voice.close()
    assertEquals(0, voice.split(ShortArray(VoiceFrames.FRAME_SAMPLES)).size)
    assertEquals(1, model.closed)
    assertEquals(0, model.computed)
  }

  private companion object {
    const val FIXTURES = "../../../../hub/test/assistant/fixtures"
    val NAMES = listOf("ai", "ai_self", "far_hw_us", "far_nm_coord", "far_quiet_hw_us", "hw_gb2", "hw_jarvis", "hw_us1", "nm_coord", "nm_talk", "person")
    const val NOISE_SEED = 12345L
    const val NOISE_SAMPLES = 8000
    const val NOISE_STEP = 1777
    const val NOISE_SHIFT = 33
    const val NOISE_SPAN = 120
    const val LCG_MULTIPLIER = 6364136223846793005L
    const val LCG_INCREMENT = 1442695040888963407L
    const val LOUDNESS_MIDPOINT = 42.0
    const val LOUDNESS_SLOPE = 2.0
    const val HASH_SEED = 17L
    const val SEGMENT_SEED = 7L
    const val HASH_PRIME = 31
    const val SAMPLES_PER_MS = 16
    const val PAUSE_GAP = 777 * 3
    val BEFORE_640_320 = listOf(
      "wake fed=672484 chunks=1810 hash=-2073487572613822173 restarts=9 opened=[8960, 5760, 10240, 10240, 10240, 10240, 10240, 10240, 10240, 10240]",
      "segments=10 360-6800:102912:-5968190194842900102;6920-12200:84480:6971998544957187516;13280-15020:27648:1673684894687304682;" +
        "17840-20800:47616:501379242501807680;27700-31120:54784:3993229404319857489;31720-34200:39424:4674552077947617154;" +
        "34760-38260:55808:-2409209998878398628;38960-41780:45056:5049208058964279564;42640-46520:61952:1499607106635371278;" +
        "47400-53050:90624:8700031053575957136"
    )
    val BEFORE_2500_1000 = listOf(
      "wake fed=673724 chunks=588 hash=5268439536522919636 restarts=9 opened=[9000, 5000, 10240, 10240, 10240, 10240, 10240, 10240, 10240, 10240]",
      "segments=3 367-16937:264704:-986829199972686505;17867-22750:77824:5780018224140053815;27742-53050:406016:-1380179295845807104"
    )
  }
}
