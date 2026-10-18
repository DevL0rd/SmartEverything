package expo.modules.healthconnect.listening

import expo.modules.healthconnect.HubJson
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ListeningConfigWakeTest {
  @Test
  fun `a config without the wake switch listens for the wake word`() {
    assertTrue(HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":false,"pause_ms":200}""").wake)
  }

  @Test
  fun `the wake switch can be turned off while writing down stays on`() {
    val config = HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":true,"pause_ms":200,"wake":false}""")
    assertFalse(config.wake)
    assertTrue(config.transcribe)
  }
}
