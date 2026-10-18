package expo.modules.healthconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class HubClientPathTest {
  private val client = HubClient(IngestTarget("https://hub.example/api/ble/", "token"))

  @Test
  fun `an absolute api path resolves against the hub origin`() {
    assertEquals("https://hub.example/api/nodes/self/report", client.urlOf("/api/nodes/self/report").toString())
  }

  @Test
  fun `a path relative to the credential base is refused`() {
    assertThrows(IllegalArgumentException::class.java) { client.urlOf("../nodes/self/report") }
    assertThrows(IllegalArgumentException::class.java) { client.urlOf("adverts") }
  }

  @Test
  fun `an absolute path outside the api is refused`() {
    assertThrows(IllegalArgumentException::class.java) { client.urlOf("/talk") }
  }
}
