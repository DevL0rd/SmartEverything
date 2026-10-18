package expo.modules.healthconnect.overlay

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test

class CallOverlayStateTest {
  private val id = "6c1c4f32-0b8e-4c55-9d7a-2b1f8f6a1e01"
  private val prefs = OverlayPrefsData()

  private fun view(facts: CallFacts?, foreground: Boolean = false, now: Long = 1_000L, wake: OverlayWake? = null): OverlayViewState =
    overlayView(CallOverlayState.inputOf(facts, wake, prefs, foreground, now))

  private fun message(json: String, facts: CallFacts, now: Long = 1_000L): CallFacts =
    CallOverlayState.message(facts, JSONObject(json), now)

  private fun live(): CallFacts = CallOverlayState.begun(CallFacts(id, CallOwner.Native), 500L)

  @Test
  fun `a running call shows the bar only while the app is not in front`() {
    val facts = message("""{"type":"call_state","callId":"$id","state":"listening"}""", live())
    assertEquals(OverlayState.Listening, view(facts).state)
    assertEquals(OverlayState.Hidden, view(facts, foreground = true).state)
  }

  @Test
  fun `call states and captions drive the phone bar`() {
    var facts = message("""{"type":"call_state","callId":"$id","state":"speaking"}""", live())
    facts = message("""{"type":"caption","callId":"$id","who":"assistant","text":"The lights are on"}""", facts)
    val speaking = view(facts)
    assertEquals(OverlayState.Speaking, speaking.state)
    assertEquals("The lights are on", speaking.caption)
    assertEquals(listOf(OverlayControl.Mute, OverlayControl.Interrupt, OverlayControl.More, OverlayControl.End), speaking.controls)
  }

  @Test
  fun `messages for another call are ignored`() {
    val facts = message("""{"type":"call_state","callId":"other","state":"thinking"}""", live())
    assertEquals(CallPhase.Connecting, facts.phase)
  }

  @Test
  fun `the speaker and the camera live in the menu tiles while the bar keeps mute, more and end`() {
    val facts = CallOverlayState.notice(live(), CallNoticeFacts(muted = true, camera = true, screen = false, speaker = false))
    val muted = view(facts)
    assertEquals(listOf(OverlayControl.Mute, OverlayControl.More, OverlayControl.End), muted.controls)
    assertEquals(OverlayCopy.MUTED, muted.status)
    val tiles = muted.tray?.tiles.orEmpty().associateBy { it.id }
    assertEquals(false, tiles.getValue(TileId.Speaker).pressed)
    assertEquals(true, tiles.getValue(TileId.Camera).pressed)
  }

  @Test
  fun `sharing the screen keeps stop sharing on the bar, swaps the share tile and drops the glow`() {
    val facts = CallOverlayState.notice(live(), CallNoticeFacts(muted = false, camera = true, screen = true, speaker = null))
    val sharing = view(facts)
    assertEquals(listOf(OverlayControl.Mute, OverlayControl.StopShare, OverlayControl.More, OverlayControl.End), sharing.controls)
    val ids = sharing.tray?.tiles.orEmpty().map { it.id }
    assertTrue(TileId.StopShare in ids)
    assertTrue(TileId.ShareScreen !in ids)
    assertTrue(TileId.Speaker !in ids)
    assertEquals(GlowMode.Off, sharing.glow)
  }

  @Test
  fun `a dropped link reconnects and comes back to the phase it left`() {
    val thinking = message("""{"type":"call_state","callId":"$id","state":"thinking"}""", live())
    val lost = CallOverlayState.link(thinking, reconnecting = true)
    assertEquals(OverlayState.Reconnecting, view(lost).state)
    assertEquals(CallPhase.Thinking, CallOverlayState.link(CallOverlayState.link(lost, reconnecting = true), reconnecting = false).phase)
  }

  @Test
  fun `an ended call shows call ended briefly and then hides`() {
    val ended = message("""{"type":"ended","callId":"$id","reason":"hung_up","detail":null}""", live(), now = 2_000L)
    assertEquals(OverlayState.Ended, view(ended, now = 2_100L).state)
    assertEquals(OverlayState.Hidden, view(ended, now = 2_000L + OverlayTiming.ENDED_MS).state)
    assertNull(ended.problem)
  }

  @Test
  fun `a failed native start shows the problem with its fix even before the call began`() {
    val failed = CallOverlayState.failed(CallFacts(id, CallOwner.Native), 1_000L, "Allow the microphone", ProblemFix.Microphone)
    val shown = view(failed)
    assertEquals(OverlayState.Error, shown.state)
    assertEquals(OverlayCopy.MICROPHONE_BLOCKED, shown.status)
    assertEquals(listOf(OverlayControl.Fix, OverlayControl.Close), shown.controls)
  }

  @Test
  fun `a failure after the call ended does not replace the ending`() {
    val ended = CallOverlayState.ended(live(), 1_000L, null)
    assertNull(CallOverlayState.failed(ended, 1_100L, "dropped").problem)
  }

  @Test
  fun `before the call links the wake view listens and invites the person to speak`() {
    val waiting = view(CallFacts(id, CallOwner.Native), wake = OverlayWake(900L, null, false))
    assertEquals(OverlayState.Wake, waiting.state)
    assertEquals(OverlayCopy.WAKE_CAPTION, waiting.caption)
  }

  @Test
  fun `captions are left out when the person turned them off`() {
    val facts = message("""{"type":"caption","callId":"$id","who":"person","text":"Turn on the lights"}""", live())
    val quiet = overlayView(CallOverlayState.inputOf(facts, null, prefs.copy(captions = false), false, 1_000L))
    assertNull(quiet.caption)
    assertEquals("Turn on the lights", view(facts).caption)
  }
}
