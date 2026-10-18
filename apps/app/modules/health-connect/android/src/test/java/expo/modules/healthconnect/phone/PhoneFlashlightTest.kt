package expo.modules.healthconnect.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneFlashlightTest {
  @Test
  fun `a strength percent rounds up to a whole level and stays inside the phone's range`() {
    assertEquals(1, PhoneFlashlight.levelFor(1, 5))
    assertEquals(2, PhoneFlashlight.levelFor(30, 5))
    assertEquals(3, PhoneFlashlight.levelFor(50, 5))
    assertEquals(5, PhoneFlashlight.levelFor(100, 5))
    assertEquals(5, PhoneFlashlight.levelFor(250, 5))
  }
}
