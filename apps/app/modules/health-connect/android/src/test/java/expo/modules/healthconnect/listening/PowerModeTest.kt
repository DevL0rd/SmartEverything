package expo.modules.healthconnect.listening

import expo.modules.healthconnect.HubJson
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class PowerModeTest {
  private val awake = PowerState(screenOn = true, charging = false, atHome = false)

  @Test
  fun `always never rests`() {
    assertNull(ListeningPower.restOf(PowerMode.Always, PowerState(screenOn = false, charging = false, atHome = true)))
  }

  @Test
  fun `screen on rests while the screen is off`() {
    assertNull(ListeningPower.restOf(PowerMode.ScreenOn, awake))
    assertEquals(ListeningPower.SCREEN_OFF, ListeningPower.restOf(PowerMode.ScreenOn, awake.copy(screenOn = false)))
  }

  @Test
  fun `charging rests while unplugged`() {
    assertEquals(ListeningPower.NOT_CHARGING, ListeningPower.restOf(PowerMode.Charging, awake))
    assertNull(ListeningPower.restOf(PowerMode.Charging, awake.copy(charging = true)))
  }

  @Test
  fun `away from home rests while the home network is reachable`() {
    assertNull(ListeningPower.restOf(PowerMode.AwayFromHome, awake))
    assertEquals(ListeningPower.AT_HOME, ListeningPower.restOf(PowerMode.AwayFromHome, awake.copy(atHome = true)))
  }

  @Test
  fun `a change that does not flip the decision does not notify`() {
    var notified = 0
    val power = ListeningPower(PowerMode.ScreenOn, awake) { notified += 1 }
    power.charging(true)
    power.home(true)
    power.screen(true)
    assertEquals(0, notified)
    power.screen(false)
    assertEquals(1, notified)
    assertEquals(ListeningPower.SCREEN_OFF, power.reason())
    power.screen(false)
    assertEquals(1, notified)
    power.screen(true)
    assertEquals(2, notified)
    assertNull(power.reason())
  }

  @Test
  fun `the initial state decides the first reason`() {
    val power = ListeningPower(PowerMode.Charging, awake) {}
    assertEquals(ListeningPower.NOT_CHARGING, power.reason())
    power.charging(true)
    assertNull(power.reason())
  }

  @Test
  fun `a config without a power mode listens always`() {
    val config = HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":false,"pause_ms":200}""")
    assertEquals(PowerMode.Always, config.powerMode)
  }

  @Test
  fun `each power mode decodes from its wire name`() {
    val wire = mapOf(
      "always" to PowerMode.Always,
      "screen_on" to PowerMode.ScreenOn,
      "charging" to PowerMode.Charging,
      "away_from_home" to PowerMode.AwayFromHome
    )
    wire.forEach { (name, mode) ->
      val config = HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":true,"pause_ms":200,"power_mode":"$name"}""")
      assertEquals(mode, config.powerMode)
    }
  }

  @Test
  fun `unknown fields are ignored`() {
    val config = HubJson.decode<ListeningConfig>(
      """{"keywords":"","threshold":0.15,"transcribe":true,"pause_ms":200,"nearMissThreshold":0.06,"sensitivity":"standard","later":1}"""
    )
    assertEquals(PowerMode.Always, config.powerMode)
  }

  @Test
  fun `an unknown power mode is refused`() {
    assertThrows(SerializationException::class.java) {
      HubJson.decode<ListeningConfig>("""{"keywords":"","threshold":0.15,"transcribe":true,"pause_ms":200,"power_mode":"sometimes"}""")
    }
  }
}
