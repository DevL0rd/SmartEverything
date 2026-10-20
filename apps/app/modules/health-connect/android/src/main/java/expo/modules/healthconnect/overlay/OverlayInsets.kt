package expo.modules.healthconnect.overlay

import androidx.core.view.WindowInsetsCompat

class OverlayInsetsSource(
  val navigationBottom: Int,
  val tappableBottom: Int,
  val gesturesBottom: Int,
  val cutoutLeft: Int,
  val cutoutRight: Int,
  val barsLeft: Int,
  val barsRight: Int,
  val barsTop: Int = 0,
  val cutoutTop: Int = 0,
)

data class OverlayInsets(val left: Int, val right: Int, val bottom: Int, val top: Int = 0) {
  fun withTopOf(system: OverlayInsets): OverlayInsets = copy(top = system.top)

  companion object {
    fun of(source: OverlayInsetsSource, density: Float): OverlayInsets {
      val bottom = maxOf(source.navigationBottom, source.tappableBottom, source.gesturesBottom)
      return OverlayInsets(
        left = maxOf(source.cutoutLeft, source.barsLeft),
        right = maxOf(source.cutoutRight, source.barsRight),
        bottom = bottom + Math.round(OverlayDims.PILL_BOTTOM_GAP * density),
        top = maxOf(source.cutoutTop, source.barsTop),
      )
    }

    fun read(insets: WindowInsetsCompat, density: Float): OverlayInsets {
      val navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      val tappable = insets.getInsets(WindowInsetsCompat.Type.tappableElement())
      val gestures = insets.getInsets(WindowInsetsCompat.Type.mandatorySystemGestures())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val source = OverlayInsetsSource(
        navigationBottom = navigation.bottom,
        tappableBottom = tappable.bottom,
        gesturesBottom = gestures.bottom,
        cutoutLeft = cutout.left,
        cutoutRight = cutout.right,
        barsLeft = bars.left,
        barsRight = bars.right,
        barsTop = bars.top,
        cutoutTop = cutout.top,
      )
      return of(source, density)
    }
  }
}

object OverlayWidth {
  fun pillMax(screenWidthDp: Float): Float =
    minOf(OverlayDims.PILL_MAX_WIDTH, screenWidthDp - OverlayDims.PILL_SCREEN_MARGIN)

  fun narrow(screenWidthDp: Float): Boolean = screenWidthDp < OverlayDims.NARROW_BELOW

  fun pill(contentDp: Float, screenWidthDp: Float): Float {
    val max = pillMax(screenWidthDp)
    return minOf(max, maxOf(minOf(OverlayDims.PILL_MIN_WIDTH, max), contentDp))
  }
}
