package expo.modules.healthconnect.overlay

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeHub(var stored: VoiceLevel = VoiceLevel.Off) : ThinkingHub {
  var failure: Exception? = null
  var gate: CompletableDeferred<Unit>? = null
  val written = ArrayList<VoiceLevel>()

  override suspend fun read(): VoiceLevel {
    failure?.let { throw it }
    return stored
  }

  override suspend fun write(level: VoiceLevel): VoiceLevel {
    gate?.await()
    failure?.let { throw it }
    written.add(level)
    stored = level
    return level
  }
}

class OverlayThinkingTest {
  private var changes = 0

  private fun thinking(hub: ThinkingHub) =
    OverlayThinking(hub, CoroutineScope(Dispatchers.Unconfined), { it() }) { changes += 1 }

  @Test
  fun `the section is not loaded until the first read, then shows the hub level`() {
    val hub = FakeHub(VoiceLevel.High)
    val state = thinking(hub)
    assertNull(state.voice("call").thinkingLevel)
    state.load()
    assertEquals(VoiceLevel.High, state.voice("call").thinkingLevel)
    assertFalse(state.voice("call").failed)
  }

  @Test
  fun `a failed read is shown as failed with no level`() {
    val hub = FakeHub().apply { failure = java.io.IOException("offline") }
    val state = thinking(hub)
    state.load()
    val voice = state.voice("call")
    assertNull(voice.thinkingLevel)
    assertTrue(voice.failed)
    assertEquals(SetupState.Failed, setupOf(voice).state)
    assertEquals(ThinkingCopy.LOAD_FAILED, setupOf(voice).note)
  }

  @Test
  fun `a press shows the pressed level while saving and the hub level after`() {
    val hub = FakeHub().apply { gate = CompletableDeferred() }
    val state = thinking(hub)
    state.load()
    state.choose(VoiceLevel.Medium, "call")
    val saving = state.voice("call")
    assertEquals(VoiceLevel.Medium, saving.thinkingLevel)
    assertTrue(saving.saving)
    assertFalse(saving.changedInCall)
    hub.gate?.complete(Unit)
    val saved = state.voice("call")
    assertEquals(VoiceLevel.Medium, saved.thinkingLevel)
    assertFalse(saved.saving)
    assertTrue(saved.changedInCall)
    assertFalse(state.voice("other").changedInCall)
    assertEquals(listOf(VoiceLevel.Medium), hub.written)
  }

  @Test
  fun `a failed save falls back to the hub level and marks the failure`() {
    val hub = FakeHub(VoiceLevel.Low)
    val state = thinking(hub)
    state.load()
    hub.failure = java.io.IOException("offline")
    state.choose(VoiceLevel.High, "call")
    val voice = state.voice("call")
    assertEquals(VoiceLevel.Low, voice.thinkingLevel)
    assertTrue(voice.failed)
    assertFalse(voice.changedInCall)
    hub.failure = null
    state.choose(VoiceLevel.High, "call")
    assertFalse(state.voice("call").failed)
    assertEquals(VoiceLevel.High, state.voice("call").thinkingLevel)
  }

  @Test
  fun `the reconnect note ends when the call reconnects`() {
    val hub = FakeHub()
    val state = thinking(hub)
    state.load()
    state.choose(VoiceLevel.High, "call")
    assertTrue(state.voice("call").changedInCall)
    val before = changes
    state.reconnected()
    assertFalse(state.voice("call").changedInCall)
    assertEquals(before + 1, changes)
    state.reconnected()
    assertEquals(before + 1, changes)
  }

  @Test
  fun `the chip shows only on the calm bar and is icon only on a narrow screen`() {
    val chip = OverlayChip(VoiceLevel.Off, "Thinking off", "Thinking off. Open thinking settings.", false)
    val base = OVERLAY_HIDDEN.copy(chip = chip)
    assertTrue(OverlayChipMath.shown(base.copy(mode = OverlayMode.Compact)))
    assertFalse(OverlayChipMath.shown(base.copy(mode = OverlayMode.Full)))
    assertFalse(OverlayChipMath.shown(OVERLAY_HIDDEN.copy(mode = OverlayMode.Compact)))
    assertTrue(OverlayChipMath.iconOnly(360f))
    assertFalse(OverlayChipMath.iconOnly(412f))
    assertEquals(OverlayIcon.BrainOff, OverlayChipMath.icon(VoiceLevel.Off))
    assertEquals(OverlayIcon.Brain, OverlayChipMath.icon(VoiceLevel.Low))
  }

  @Test
  fun `each thinking segment is a full 48 dp touch target inside its track`() {
    assertEquals(48f, OverlaySegmentMath.segmentDp())
    assertEquals(OverlaySegmentMath.segmentDp() + 2 * OverlayDims.SEG_GAP, OverlaySegmentMath.trackDp())
  }

  @Test
  fun `the labelled chip grows to its whole label so Thinking Medium is never cut`() {
    val label = 100f
    val width = OverlayChipMath.labelledDp(label)
    assertEquals(2 * OverlayDims.CHIP_PADDING + OverlayDims.CHIP_ICON + OverlayDims.CHIP_GAP + label, width)
    assertTrue(width > 132f)
  }
}
