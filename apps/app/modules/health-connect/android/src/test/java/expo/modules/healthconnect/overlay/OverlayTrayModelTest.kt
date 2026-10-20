package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Test

class OverlayTrayModelTest {
  private fun tray(chat: String?, from: Long?) = OverlayTray("The assistant", chat, from, emptyList(), OverlaySetup(null, SetupState.Loading, ThinkingCopy.LOADING), emptyList(), null, 1.0)

  @Test
  fun `the subtitle joins the chat title and the time in the call`() {
    assertEquals("Kitchen · 2:14", OverlayTrayModel.subtitle(tray("Kitchen", 1_000L), 135_000L))
    assertEquals("0:05", OverlayTrayModel.subtitle(tray(null, 0L), 5_000L))
    assertEquals("", OverlayTrayModel.subtitle(tray(null, null), 5_000L))
  }

  @Test
  fun `the camera tile shows the crossed camera until the camera is on`() {
    val off = OverlayTile(TileId.Camera, "Camera", false, null, false)
    assertEquals(OverlayIcon.CameraOff, OverlayTrayModel.iconOf(off))
    assertEquals(OverlayIcon.Camera, OverlayTrayModel.iconOf(off.copy(pressed = true)))
  }

  @Test
  fun `a disabled tile is described with its reason`() {
    val tile = OverlayTile(TileId.PauseVideo, "Pause video", false, "Turn the camera on first", false)
    assertEquals("Pause video. Turn the camera on first", OverlayTrayModel.describe(tile))
    assertEquals("Pause video", OverlayTrayModel.describe(tile.copy(disabled = null)))
  }

  @Test
  fun `tiles fill rows of four and share the width evenly`() {
    assertEquals(0, OverlayTrayModel.rows(0))
    assertEquals(1, OverlayTrayModel.rows(4))
    assertEquals(2, OverlayTrayModel.rows(5))
    assertEquals(2, OverlayTrayModel.rows(8))
    assertEquals(86.5f, OverlayTrayModel.tileWidth(364f, 6f), 0.01f)
  }

  @Test
  fun `the tray is as wide as the pill allows on a narrow phone and capped on a wide one`() {
    assertEquals(388f, OverlayTrayModel.width(412f), 0f)
    assertEquals(420f, OverlayTrayModel.width(900f), 0f)
  }
}
