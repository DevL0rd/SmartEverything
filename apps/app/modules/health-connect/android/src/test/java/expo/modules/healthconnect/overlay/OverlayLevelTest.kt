package expo.modules.healthconnect.overlay

import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayLevelTest {
  @Test
  fun `every shared level vector gives the same smoothed level`() {
    val rows = OverlayVectors.levels
    assertTrue(rows.size >= 10)
    for (row in rows) {
      val fields = row.jsonObject
      val next = overlayLevel(
        fields.getValue("previous").jsonPrimitive.content.toDouble(),
        fields.getValue("sample").jsonPrimitive.content.toDouble(),
        fields.getValue("dtMs").jsonPrimitive.content.toDouble(),
      )
      assertEquals(fields.toString(), fields.getValue("next").jsonPrimitive.content.toDouble(), next, TOLERANCE)
    }
  }

  @Test
  fun `a silent sample falls to exactly zero and never goes negative`() {
    var level = 0.5
    repeat(200) { level = overlayLevel(level, 0.0, 16.0) }
    assertEquals(0.0, level, 0.0)
    assertEquals(0.0, overlayLevel(-1.0, -1.0, 16.0), 0.0)
    assertEquals(0.0, overlayLevel(Double.NaN, Double.NaN, 16.0), 0.0)
  }

  @Test
  fun `a loud sample attacks faster than it releases`() {
    val up = overlayLevel(0.0, 1.0, 16.0)
    val down = 1.0 - overlayLevel(1.0, 0.0, 16.0)
    assertTrue(up > down)
    assertEquals(1.0, overlayLevel(1.0, 5.0, 1000.0), TOLERANCE)
  }

  @Test
  fun `a frame without elapsed time keeps the previous level`() {
    assertEquals(0.4, overlayLevel(0.4, 1.0, 0.0), 0.0)
    assertEquals(0.4, overlayLevel(0.4, 1.0, -5.0), 0.0)
  }

  @Test
  fun `the follower keeps its level between frames and resets`() {
    val follower = OverlayLevelFollower()
    val first = follower.advance(1.0, 16.0)
    assertEquals(first, follower.level, 0.0)
    assertTrue(follower.advance(1.0, 16.0) > first)
    follower.reset()
    assertEquals(0.0, follower.level, 0.0)
  }

  @Test
  fun `the tap wakes its listener only when the sound rises from silence`() {
    val tap = OverlayLevelTap()
    var woken = 0
    tap.setWake(Runnable { woken++ })
    tap.set(0.0)
    assertEquals(0, woken)
    tap.set(0.5)
    assertEquals(1, woken)
    tap.set(0.6)
    assertEquals(1, woken)
    tap.clear()
    assertEquals(0.0, tap.sample(), 0.0)
    tap.set(0.5)
    assertEquals(2, woken)
    tap.setWake(null)
    tap.set(0.0)
    tap.set(0.5)
    assertEquals(2, woken)
  }

  @Test
  fun `the audible threshold is the raw sample whose shaped value reaches the floor`() {
    assertEquals(OVERLAY_LEVEL_FLOOR, Math.pow(OVERLAY_LEVEL_AUDIBLE, OVERLAY_LEVEL_SHAPE), 1e-12)
  }

  @Test
  fun `rest starts after the silent time and ends with a sound or a wake`() {
    val rest = OverlayRest()
    rest.silentMs = 1000
    assertFalse(rest.advance(false, 600.0))
    assertTrue(rest.advance(false, 600.0))
    assertTrue(rest.resting)
    assertFalse(rest.advance(true, 16.0))
    assertFalse(rest.resting)
    rest.advance(false, 2000.0)
    assertTrue(rest.resting)
    rest.wake()
    assertFalse(rest.resting)
    assertFalse(rest.advance(false, 500.0))
  }

  companion object {
    private const val TOLERANCE = 1e-9
  }
}
