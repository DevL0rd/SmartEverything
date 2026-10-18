package expo.modules.healthconnect.overlay

import expo.modules.healthconnect.HubJson
import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

object OverlayVectors {
  private const val PATH = "../../../../../packages/domain/test/fixtures/voice-overlay-vectors.json"

  val document: JsonObject = HubJson.parseObject(File(PATH).readText())

  val views: JsonArray
    get() = document.getValue("views").jsonArray

  val levels: JsonArray
    get() = document.getValue("levels").jsonArray
}

@RunWith(Parameterized::class)
class OverlayPhaseVectorTest(private val name: String, private val case: JsonObject) {
  @Test
  fun `the view equals the one the domain computes for the same input`() {
    val input = HubJson.json.decodeFromJsonElement<OverlayInput>(case.getValue("input"))
    val expected = HubJson.json.decodeFromJsonElement<OverlayViewState>(case.getValue("view"))
    assertEquals(name, expected, overlayView(input))
  }

  companion object {
    @JvmStatic
    @Parameterized.Parameters(name = "{0}")
    fun cases(): List<Array<Any>> =
      OverlayVectors.views.map { arrayOf(it.jsonObject.getValue("name").jsonPrimitive.content, it.jsonObject) }
  }
}

class OverlayPhaseCoverageTest {
  @Test
  fun `the shared vectors cover every state and the phone surface`() {
    val states = OverlayVectors.views.map { it.jsonObject.getValue("view").jsonObject.getValue("state").jsonPrimitive.content }.toSet()
    assertTrue(states.containsAll(listOf("wake", "listening", "thinking", "speaking", "reconnecting", "error", "superseded", "ended", "hidden")))
    val phone = OverlayVectors.views.count {
      it.jsonObject.getValue("input").jsonObject.getValue("surface").jsonObject.getValue("platform").jsonPrimitive.content == "phone"
    }
    assertTrue(phone >= 2)
  }

  @Test
  fun `a phone call is hidden while the app is in front and offers mute, stop, the menu and end otherwise`() {
    val base = vector("phone-speaking")
    val hidden = overlayView(base.copy(surface = OverlaySurface.Phone(foreground = true)))
    assertEquals(OverlayState.Hidden, hidden.state)
    val shown = overlayView(base)
    assertEquals(listOf(OverlayControl.Mute, OverlayControl.Interrupt, OverlayControl.More, OverlayControl.End), shown.controls)
    assertEquals(
      listOf(TileId.Camera, TileId.PauseVideo, TileId.ShareScreen, TileId.HomeCamera, TileId.Interrupt, TileId.Captions, TileId.Settings),
      shown.tray?.tiles?.map { it.id },
    )
  }

  @Test
  fun `a wake heard while the app is not in front shows mute and end only`() {
    val view = overlayView(vector("wake").copy(surface = OverlaySurface.Phone(foreground = false)))
    assertEquals(OverlayState.Wake, view.state)
    assertEquals(listOf(OverlayControl.Mute, OverlayControl.End), view.controls)
  }

  @Test
  fun `a disabled overlay is never shown`() {
    val input = vector("phone-speaking")
    assertEquals(OverlayState.Hidden, overlayView(input.copy(prefs = input.prefs.copy(enabled = false))).state)
  }

  private fun vector(name: String): OverlayInput {
    val case = OverlayVectors.views.first { it.jsonObject.getValue("name").jsonPrimitive.content == name }
    return HubJson.json.decodeFromJsonElement(case.jsonObject.getValue("input"))
  }
}
