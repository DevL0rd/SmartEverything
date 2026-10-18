package expo.modules.healthconnect.assistant

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CallReplayTest {
  private fun keep(replay: CallReplay, json: String) = replay.keep(JSONObject(json), json)

  @Test
  fun `an attaching app gets the latest capabilities, call state and captions in order`() {
    val replay = CallReplay(startedAt = 42L)
    keep(replay, """{"type":"capabilities","interrupt":true}""")
    keep(replay, """{"type":"call_state","state":"listening"}""")
    keep(replay, """{"type":"caption","who":"person","text":"hi"}""")
    keep(replay, """{"type":"call_state","state":"speaking"}""")
    keep(replay, """{"type":"sight_looked"}""")
    val snapshot = replay.snapshot("call", muted = true)
    val texts = (0 until snapshot.getJSONArray("replay").length()).map { snapshot.getJSONArray("replay").getString(it) }
    assertEquals(
      listOf(
        """{"type":"capabilities","interrupt":true}""",
        """{"type":"caption","who":"person","text":"hi"}""",
        """{"type":"call_state","state":"speaking"}"""
      ),
      texts
    )
    assertEquals(42L, snapshot.getLong("startedAt"))
    assertEquals(true, snapshot.getBoolean("muted"))
  }
}
