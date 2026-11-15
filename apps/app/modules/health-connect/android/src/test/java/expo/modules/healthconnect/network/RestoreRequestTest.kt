package expo.modules.healthconnect.network

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RestoreRequestTest {
  private val id = "a".repeat(64)

  private fun json(target: JSONObject, name: String = "IMG_1.jpg", mime: String = "image/jpeg"): String =
    JSONObject()
      .put("id", id)
      .put("name", name)
      .put("mimeType", mime)
      .put("sha256", JSONObject.NULL)
      .put("takenAt", 1_717_237_230_000L)
      .put("target", target)
      .toString()

  private fun origin(folder: String) = JSONObject().put("kind", "origin").put("folder", folder)

  @Test fun `a photo without an origin goes to the Restored album`() {
    val request = RestoreRequest.parse(json(JSONObject().put("kind", "restored")))
    assertNull(request.folder)
    assertEquals("Pictures/Restored/", request.relativePath())
    assertEquals(1_717_237_230_000L, request.takenAt)
  }

  @Test fun `a photo from this phone goes back to its album`() {
    assertEquals("DCIM/Camera/", RestoreRequest.parse(json(origin("DCIM/Camera"))).relativePath())
    assertEquals(
      "Movies/Clips/",
      RestoreRequest.parse(json(origin("Movies/Clips/"), "a.mp4", "video/mp4")).relativePath(),
    )
  }

  @Test fun `refuses folders Android keeps out of the gallery and unsafe names`() {
    assertThrows(IllegalArgumentException::class.java) {
      RestoreRequest.parse(json(origin("Movies/Clips"))).relativePath()
    }
    assertThrows(IllegalArgumentException::class.java) {
      RestoreRequest.parse(json(origin("DCIM/../Android"))).relativePath()
    }
    assertThrows(IllegalArgumentException::class.java) {
      RestoreRequest.parse(json(JSONObject().put("kind", "restored"), name = "a/b.jpg"))
    }
    assertThrows(IllegalArgumentException::class.java) {
      RestoreRequest.parse(json(JSONObject().put("kind", "restored"), mime = "text/plain"))
    }
  }
}
