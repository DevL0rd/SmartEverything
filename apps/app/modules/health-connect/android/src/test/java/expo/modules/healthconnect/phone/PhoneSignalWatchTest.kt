package expo.modules.healthconnect.phone

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneSignalWatchTest {
  @Test
  fun `the default network reports again only when its kind, metering or VPN changed`() {
    val watch = PhoneDefaultNetworkWatch {}
    assertTrue(watch.shapeChanged(listOf("wifi", true, true)))
    assertFalse(watch.shapeChanged(listOf("wifi", true, true)))
    assertTrue(watch.shapeChanged(listOf("wifi", false, true)))
    assertTrue(watch.shapeChanged(listOf("cellular", false, true)))
    assertTrue(watch.shapeChanged(listOf("cellular", false, false)))
    assertFalse(watch.shapeChanged(listOf("cellular", false, false)))
  }
}
