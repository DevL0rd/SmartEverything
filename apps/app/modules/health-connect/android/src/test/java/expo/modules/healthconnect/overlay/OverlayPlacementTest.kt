package expo.modules.healthconnect.overlay

import expo.modules.healthconnect.MemoryPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayPlacementTest {
  private val density = 2f
  private val insets = OverlayInsets(left = 0, right = 0, bottom = 120, top = 80)
  private val size = PillSize(640, 128)
  private val area = OverlayDrag.area(1080, 2400, insets, density)
  private val home = OverlayDrag.home(OverlayPosition.Centre, size, 1080, insets, area, density)

  @Test
  fun `the area stays inside the status bar and the navigation bar`() {
    assertEquals(PixelBox(16, 96, 1064, 2400 - 120 - 48), area)
  }

  @Test
  fun `the home position is the lowest centred spot`() {
    assertEquals(PixelPoint((1080 - 640) / 2, area.bottom - 128), home)
  }

  @Test
  fun `a pill dragged past any edge is clamped into the area`() {
    val clamped = OverlayDrag.clamp(PixelPoint(-500, 5000), size, area)
    assertEquals(PixelPoint(area.left, area.bottom - 128), clamped)
    assertEquals(PixelPoint(area.right - 640, area.top), OverlayDrag.clamp(PixelPoint(5000, -500), size, area))
  }

  @Test
  fun `a remembered spot comes back where it was and never leaves the area`() {
    val origin = PixelPoint(300, 900)
    val at = OverlayDrag.placementOf(origin, size, area)
    assertEquals(origin, OverlayDrag.originOf(at, size, area))
    assertEquals(PixelPoint(area.right - 640, area.top), OverlayDrag.originOf(FreePlacement(1f, 0f), size, area))
  }

  @Test
  fun `a drop near home snaps home and a drop elsewhere stays free`() {
    val near = PixelPoint(home.x + 100, home.y - 100)
    assertEquals(OverlayPlacement.Home, OverlayDrag.settle(near, home, size, area, density))
    val far = PixelPoint(home.x, home.y - 400)
    assertTrue(OverlayDrag.settle(far, home, size, area, density) is OverlayPlacement.Free)
    assertFalse(OverlayDrag.nearHome(far, home, density))
  }

  @Test
  fun `the glow shows only at home and not while dragging`() {
    val free = OverlayPlacement.Free(FreePlacement(0.5f, 0.5f))
    assertEquals(GlowMode.Listening, OverlayGlowRule.mode(GlowMode.Listening, OverlayPlacement.Home, false))
    assertEquals(GlowMode.Off, OverlayGlowRule.mode(GlowMode.Listening, OverlayPlacement.Home, true))
    assertEquals(GlowMode.Off, OverlayGlowRule.mode(GlowMode.Shimmer, free, false))
  }

  @Test
  fun `the position is remembered separately for each orientation and can be cleared`() {
    val store = OverlayPlacementStore(MemoryPreferences())
    val spot = OverlayPlacement.Free(FreePlacement(0.25f, 0.75f))
    store.save(OverlayOrientation.Portrait, spot)
    assertEquals(spot, store.load(OverlayOrientation.Portrait))
    assertEquals(OverlayPlacement.Home, store.load(OverlayOrientation.Landscape))
    store.save(OverlayOrientation.Portrait, OverlayPlacement.Home)
    assertEquals(OverlayPlacement.Home, store.load(OverlayOrientation.Portrait))
    store.save(OverlayOrientation.Landscape, spot)
    store.clear()
    assertEquals(OverlayPlacement.Home, store.load(OverlayOrientation.Landscape))
  }

  @Test
  fun `orientation follows the screen shape`() {
    assertEquals(OverlayOrientation.Landscape, OverlayOrientation.of(2400, 1080))
    assertEquals(OverlayOrientation.Portrait, OverlayOrientation.of(1080, 2400))
  }

  @Test
  fun `a drag follows the finger by one fixed grab offset and never feeds back`() {
    val start = PixelPoint(300, 900)
    val grab = OverlayGrab.at(500f, 950f, start)
    assertEquals(start, grab.origin(500f, 950f))
    assertEquals(PixelPoint(300, 600), grab.origin(500f, 650f))
    assertEquals(PixelPoint(340, 600), grab.origin(540f, 650f))
    val path = listOf(520f to 940f, 560f to 900f, 560f to 900f, 480f to 700f)
    val once = path.map { (x, y) -> grab.origin(x, y) }
    val again = path.map { (x, y) -> grab.origin(x, y) }
    assertEquals(once, again)
    assertEquals(PixelPoint(280, 650), once.last())
  }

  @Test
  fun `the home position sits on the navigation bar for every side`() {
    val bar = OverlayInsets(left = 40, right = 24, bottom = 168, top = 100)
    val box = OverlayDrag.area(1080, 2400, bar, density)
    val bottom = 2400 - 168 - 48 - 128
    assertEquals(PixelPoint(40 + (1080 - 40 - 24 - 640) / 2, bottom), OverlayDrag.home(OverlayPosition.Centre, size, 1080, bar, box, density))
    assertEquals(PixelPoint(40 + 96, bottom), OverlayDrag.home(OverlayPosition.Left, size, 1080, bar, box, density))
    assertEquals(PixelPoint(1080 - 24 - 96 - 640, bottom), OverlayDrag.home(OverlayPosition.Right, size, 1080, bar, box, density))
  }

  @Test
  fun `the window insets keep the measured bottom and take only the top from the system`() {
    val measured = OverlayInsets(left = 0, right = 0, bottom = 120, top = 0)
    val system = OverlayInsets(left = 0, right = 0, bottom = 120, top = 80)
    assertEquals(OverlayInsets(0, 0, 120, 80), measured.withTopOf(system))
    assertEquals(PixelBox(16, 96, 1064, 2400 - 120 - 48), OverlayDrag.area(1080, 2400, measured.withTopOf(system), density))
  }

  @Test
  fun `nothing saved means home and a saved spot is never taken for home`() {
    val store = OverlayPlacementStore(MemoryPreferences())
    assertEquals(OverlayPlacement.Home, store.load(OverlayOrientation.Portrait))
    store.save(OverlayOrientation.Portrait, OverlayPlacement.Free(FreePlacement(0f, 0f)))
    assertEquals(OverlayPlacement.Free(FreePlacement(0f, 0f)), store.load(OverlayOrientation.Portrait))
  }

  private val tray = PillSize(840, 420)
  private val gap = 20

  private fun pillAt(x: Int, y: Int) = PixelBox(x, y, x + size.width, y + size.height)

  @Test
  fun `the menu opens upward with room above and is centred on the pill`() {
    val pill = pillAt(220, 1800)
    val place = OverlayMenu.place(pill, tray, gap, area)
    assertEquals(MenuSide.Above, place.side)
    assertEquals(-100, place.shift)
  }

  @Test
  fun `the menu opens downward when the pill is near the top`() {
    val place = OverlayMenu.place(pillAt(220, area.top + 20), tray, gap, area)
    assertEquals(MenuSide.Below, place.side)
  }

  @Test
  fun `the menu stays inside the screen sides`() {
    val left = OverlayMenu.place(pillAt(area.left, 1200), tray, gap, area)
    assertEquals(0, left.shift)
    val right = OverlayMenu.place(pillAt(area.right - size.width, 1200), tray, gap, area)
    assertEquals(size.width - tray.width, right.shift)
    val near = OverlayMenu.place(pillAt(60, 1200), tray, gap, area)
    assertEquals(area.left - 60, near.shift)
    assertTrue(60 + near.shift >= area.left)
  }

  @Test
  fun `a menu that fits neither way takes the side with more room`() {
    val tall = PillSize(840, 4000)
    assertEquals(MenuSide.Above, OverlayMenu.place(pillAt(220, 1800), tall, gap, area).side)
    assertEquals(MenuSide.Below, OverlayMenu.place(pillAt(220, 200), tall, gap, area).side)
  }
}
