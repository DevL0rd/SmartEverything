package expo.modules.healthconnect.phone

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhonePowerSectionTest {
  private val context = mockk<Context>()
  private val battery = mockk<BatteryManager>()
  private val sticky = mockk<Intent>()
  private var level = 78
  private var voltage = 4137
  private var tenthsCelsius = 306
  private var availableBytes = 3_000_000_000L

  @Before
  fun setUp() {
    mockkObject(PhoneReadings)
    every { PhoneReadings.batteryLevel(any(), any()) } answers { PhoneReadings.steppedBattery(level, secondArg()) }
    every { context.registerReceiver(null, any<IntentFilter>()) } returns sticky
    every { sticky.getIntExtra(BatteryManager.EXTRA_VOLTAGE, any()) } answers { voltage }
    every { sticky.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, any()) } answers { tenthsCelsius }
    every { sticky.getIntExtra(BatteryManager.EXTRA_HEALTH, any()) } returns BatteryManager.BATTERY_HEALTH_GOOD
    every { sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, any()) } returns BatteryManager.BATTERY_PLUGGED_AC
    every { context.getSystemService(BatteryManager::class.java) } returns battery
    every { battery.isCharging } returns true
    every { battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) } returns 1_500_000
    every { context.getSystemService(ActivityManager::class.java) } returns mockk {
      every { getMemoryInfo(any()) } answers {
        firstArg<ActivityManager.MemoryInfo>().apply {
          totalMem = 12_000_000_000L
          availMem = availableBytes
        }
      }
    }
    every { context.getSystemService(PowerManager::class.java) } returns mockk { every { isPowerSaveMode } returns false }
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun section(live: Boolean, slow: Boolean = false): JSONObject =
    requireNotNull(PhonePower.section(context, PhoneSection.POWER, PhoneReadRequest(live = live, slow = slow)))

  @Test
  fun `the power section carries exactly the fields of the contract`() {
    val keys = section(live = true, slow = true).keys().asSequence().toSet()
    assertEquals(setOf("level", "voltageMv", "currentMa", "temperatureC", "health", "cycles", "charger", "fullAt", "memory"), keys)
    assertEquals(setOf("totalBytes", "availableBytes"), section(live = true, slow = true).getJSONObject("memory").keys().asSequence().toSet())
  }

  @Test
  fun `the power section has the shape the hub contract fixture names`() {
    PhoneWireFixture.sameShape(PhoneWireFixture.section("live", "power"), section(live = true, slow = true))
  }

  @Test
  fun `at rest small drifts in voltage and temperature do not change the section`() {
    val first = section(live = false, slow = true).toString()
    voltage = 4142
    tenthsCelsius = 308
    availableBytes = 2_700_000_000L
    assertEquals(first, section(live = false).toString())
  }

  @Test
  fun `at rest the battery rate is not read`() {
    assertEquals(JSONObject.NULL, section(live = false).get("currentMa"))
  }

  @Test
  fun `while live the battery rate and the exact level are reported`() {
    val live = section(live = true, slow = true)
    assertEquals(1500, live.getInt("currentMa"))
    assertEquals(78, live.getInt("level"))
    assertEquals(4137, live.getInt("voltageMv"))
    assertEquals(30.5, live.getDouble("temperatureC"), 0.0)
  }

  @Test
  fun `at rest the level steps by five`() {
    assertEquals(75, section(live = false).getInt("level"))
  }

  @Test
  fun `an unreadable battery level leaves out the section`() {
    level = -1
    assertNull(PhonePower.section(context, PhoneSection.POWER, PhoneReadRequest(live = false, slow = false)))
  }

  @Test
  fun `the scalar readings follow the same steps`() {
    val values = PhonePower.values(context, PhoneReadRequest(live = false, slow = false))
    assertEquals("ac", values["charger"])
    assertEquals(31.0, values["battery_temperature"])
    assertEquals(false, values["power_save"])
    assertTrue(values.containsKey("charge_full_at"))
  }
}
