package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Test

class TileRoutingTest {
  private fun tile(id: TileId, pressed: Boolean? = null) = OverlayTile(id, id.name, pressed, null, false)

  @Test
  fun `tiles that need the call page open it with the action the room understands`() {
    assertEquals(TileRoute.Room("camera"), TileRouting.of(tile(TileId.Camera, pressed = false)))
    assertEquals(TileRoute.Room("share"), TileRouting.of(tile(TileId.ShareScreen)))
    assertEquals(TileRoute.Room("home"), TileRouting.of(tile(TileId.HomeCamera)))
    assertEquals(TileRoute.Room("settings"), TileRouting.of(tile(TileId.Settings)))
  }

  @Test
  fun `the camera tile turns a running camera off through the call`() {
    assertEquals(TileRoute.Control(OverlayControl.Camera), TileRouting.of(tile(TileId.Camera, pressed = true)))
  }

  @Test
  fun `in call toggles reuse the bar controls and the app actions`() {
    assertEquals(TileRoute.Control(OverlayControl.Speaker), TileRouting.of(tile(TileId.Speaker, pressed = true)))
    assertEquals(TileRoute.Control(OverlayControl.Interrupt), TileRouting.of(tile(TileId.Interrupt)))
    assertEquals(TileRoute.Control(OverlayControl.StopShare), TileRouting.of(tile(TileId.StopShare)))
    assertEquals(TileRoute.App("pause_video"), TileRouting.of(tile(TileId.PauseVideo)))
    assertEquals(TileRoute.Captions, TileRouting.of(tile(TileId.Captions, pressed = true)))
  }

  @Test
  fun `every route action is one the app accepts`() {
    val room = setOf("camera", "share", "home", "settings")
    val app = setOf("pause_video", "captions")
    val seen = TileId.entries.map { TileRouting.of(tile(it, pressed = false)) }
    seen.filterIsInstance<TileRoute.Room>().forEach { assertEquals(true, it.action in room) }
    seen.filterIsInstance<TileRoute.App>().forEach { assertEquals(true, it.action in app) }
  }
}
