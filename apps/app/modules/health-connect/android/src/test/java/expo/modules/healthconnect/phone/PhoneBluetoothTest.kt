package expo.modules.healthconnect.phone

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.content.Context
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PhoneBluetoothTest {
  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun kind(major: Int, device: Int) = PhoneBluetooth.kindOf(major, device)

  @Test
  fun `each Bluetooth class maps to the kind the page draws`() {
    val audio = BluetoothClass.Device.Major.AUDIO_VIDEO
    assertEquals("watch", kind(BluetoothClass.Device.Major.WEARABLE, BluetoothClass.Device.WEARABLE_WRIST_WATCH))
    assertEquals("headset", kind(audio, BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES))
    assertEquals("headset", kind(audio, BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET))
    assertEquals("speaker", kind(audio, BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER))
    assertEquals("car", kind(audio, BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO))
    assertEquals("computer", kind(BluetoothClass.Device.Major.COMPUTER, BluetoothClass.Device.COMPUTER_LAPTOP))
    assertEquals("other", kind(0, 0))
  }

  @Test
  fun `the connections section has the shape the hub contract fixture names`() {
    val body = PhoneBluetooth.body(true, listOf(BluetoothPeer("01", "Galaxy Buds3", "headset", 80)))
    PhoneWireFixture.sameShape(PhoneWireFixture.section("live", "connections"), body)
  }

  @Test
  fun `a battery level change reports only while live and a connection change always does`() {
    assertEquals(false, PhoneBluetooth.reportsOn("android.bluetooth.device.action.BATTERY_LEVEL_CHANGED", live = false))
    assertEquals(true, PhoneBluetooth.reportsOn("android.bluetooth.device.action.BATTERY_LEVEL_CHANGED", live = true))
    assertEquals(true, PhoneBluetooth.reportsOn("android.bluetooth.device.action.ACL_CONNECTED", live = false))
  }

  @Test
  fun `connections are listed by name with unnamed devices last`() {
    val body = PhoneBluetooth.body(
      true,
      listOf(
        BluetoothPeer("03", null, "other", null),
        BluetoothPeer("02", "Watch", "watch", 64),
        BluetoothPeer("01", "buds", "headset", null)
      )
    ).getJSONArray("bluetooth")
    assertEquals(listOf("buds", "Watch", JSONObject.NULL), (0 until body.length()).map { body.getJSONObject(it).get("name") })
    assertEquals(64, body.getJSONObject(1).getInt("batteryPercent"))
    assertEquals(JSONObject.NULL, body.getJSONObject(0).get("batteryPercent"))
  }

  @Test
  fun `connections start being followed as soon as the permission is there and not before`() {
    mockkObject(PhonePermissions, PhoneBluetooth)
    val context = mockk<Context>()
    every { PhoneBluetooth.observe(any()) } returns Unit
    every { PhonePermissions.bluetooth(context) } returns false
    assertNull(PhoneBluetooth.section(context, PhoneSection.CONNECTIONS, PhoneReadRequest(live = false, slow = false)))
    verify(exactly = 0) { PhoneBluetooth.observe(any()) }
    every { PhonePermissions.bluetooth(context) } returns true
    every { context.getSystemService(BluetoothManager::class.java) } returns managerWith(enabled = true)
    PhoneBluetooth.section(context, PhoneSection.CONNECTIONS, PhoneReadRequest(live = false, slow = false))
    verify(exactly = 1) { PhoneBluetooth.observe(context) }
  }

  private fun managerWith(enabled: Boolean): BluetoothManager {
    val adapter = mockk<BluetoothAdapter>()
    every { adapter.isEnabled } returns enabled
    val manager = mockk<BluetoothManager>()
    every { manager.adapter } returns adapter
    return manager
  }

  @Test
  fun `the bluetooth switch is reported from the adapter and the section carries it`() {
    mockkObject(PhonePermissions, PhoneBluetooth)
    val context = mockk<Context>()
    every { PhoneBluetooth.observe(any()) } returns Unit
    every { PhonePermissions.bluetooth(context) } returns true
    val request = PhoneReadRequest(live = false, slow = false)
    every { context.getSystemService(BluetoothManager::class.java) } returns managerWith(enabled = false)
    assertEquals(mapOf<String, Any?>("bluetooth_on" to false), PhoneBluetooth.values(context, request))
    assertEquals(false, PhoneBluetooth.section(context, PhoneSection.CONNECTIONS, request)?.getBoolean("bluetoothOn"))
    every { context.getSystemService(BluetoothManager::class.java) } returns managerWith(enabled = true)
    assertEquals(mapOf<String, Any?>("bluetooth_on" to true), PhoneBluetooth.values(context, request))
    assertEquals(true, PhoneBluetooth.section(context, PhoneSection.CONNECTIONS, request)?.getBoolean("bluetoothOn"))
  }

  @Test
  fun `a phone without a Bluetooth adapter reports no bluetooth switch`() {
    val context = mockk<Context>()
    val manager = mockk<BluetoothManager>()
    every { manager.adapter } returns null
    every { context.getSystemService(BluetoothManager::class.java) } returns manager
    assertEquals(emptyMap<String, Any?>(), PhoneBluetooth.values(context, PhoneReadRequest(live = false, slow = false)))
  }

  @Test
  fun `turning Bluetooth on or off reports and the steps in between do not`() {
    assertEquals(true, PhoneBluetooth.stateReports(BluetoothAdapter.STATE_ON))
    assertEquals(true, PhoneBluetooth.stateReports(BluetoothAdapter.STATE_OFF))
    assertEquals(false, PhoneBluetooth.stateReports(BluetoothAdapter.STATE_TURNING_ON))
    assertEquals(false, PhoneBluetooth.stateReports(BluetoothAdapter.STATE_TURNING_OFF))
    assertEquals(false, PhoneBluetooth.stateReports(BluetoothAdapter.ERROR))
  }
}
