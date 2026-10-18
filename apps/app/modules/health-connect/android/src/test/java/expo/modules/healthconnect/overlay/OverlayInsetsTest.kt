package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayInsetsTest {
  private fun source(
    navigation: Int = 0,
    tappable: Int = 0,
    gestures: Int = 0,
    cutoutLeft: Int = 0,
    cutoutRight: Int = 0,
    barsLeft: Int = 0,
    barsRight: Int = 0,
  ) = OverlayInsetsSource(navigation, tappable, gestures, cutoutLeft, cutoutRight, barsLeft, barsRight)

  @Test
  fun `the pill sits sixteen dp above the gesture bar`() {
    val insets = OverlayInsets.of(source(navigation = 72, gestures = 72), 3f)
    assertEquals(72 + 48, insets.bottom)
  }

  @Test
  fun `the Samsung taskbar on the inner display lifts the pill above it`() {
    val insets = OverlayInsets.of(source(navigation = 0, tappable = 168, gestures = 72), 3f)
    assertEquals(168 + 48, insets.bottom)
  }

  @Test
  fun `no insets leave the sixteen dp gap alone`() {
    assertEquals(OverlayInsets(0, 0, 32), OverlayInsets.of(source(), 2f))
  }

  @Test
  fun `a display cutout or a side bar keeps the pill away from the side`() {
    val insets = OverlayInsets.of(source(cutoutLeft = 90, cutoutRight = 0, barsLeft = 0, barsRight = 40), 2f)
    assertEquals(90, insets.left)
    assertEquals(40, insets.right)
  }

  @Test
  fun `the pill is at most 480 dp and always 24 dp narrower than the screen`() {
    assertEquals(480f, OverlayWidth.pillMax(884f), 0f)
    assertEquals(388f, OverlayWidth.pillMax(412f), 0f)
    assertEquals(336f, OverlayWidth.pillMax(360f), 0f)
  }

  @Test
  fun `the pill never goes under 320 dp unless the screen is too small for it`() {
    assertEquals(320f, OverlayWidth.pill(200f, 412f), 0f)
    assertEquals(400f, OverlayWidth.pill(400f, 884f), 0f)
    assertEquals(480f, OverlayWidth.pill(900f, 884f), 0f)
    assertEquals(296f, OverlayWidth.pill(200f, 320f), 0f)
  }

  @Test
  fun `the Fold7 cover at 412 dp uses the narrow meter and the inner display does not`() {
    assertTrue(OverlayWidth.narrow(412f))
    assertTrue(OverlayWidth.narrow(360f))
    assertFalse(OverlayWidth.narrow(884f))
  }
}
