package expo.modules.healthconnect.overlay

import android.content.Context
import android.os.Build
import android.util.DisplayMetrics
import android.view.Choreographer
import android.view.Gravity
import android.view.WindowManager
import androidx.core.view.WindowInsetsCompat

interface OverlayDragSink {
  fun begin(rawX: Float, rawY: Float)

  fun move(rawX: Float, rawY: Float)

  fun end()

  fun insetsAccepted(): Boolean

  fun insetsChanged(insets: OverlayInsets)

  fun reconfigured()

  fun menuFor(tray: PillSize, gap: Int): MenuPlacement

  fun menuShown(placement: MenuPlacement?)
}

private data class ScreenFacts(val width: Int, val height: Int, val insets: OverlayInsets)

class OverlayPlacer(context: Context, private val onGlowRule: () -> Unit) : OverlayDragSink {
  private val context = context.applicationContext
  private val manager = this.context.getSystemService(WindowManager::class.java)
  private val density = this.context.resources.displayMetrics.density
  private val store = OverlayPlacementStore(this.context.getSharedPreferences(FILE, Context.MODE_PRIVATE))
  private val choreographer = Choreographer.getInstance()
  private val tick = Choreographer.FrameCallback { flush() }
  private var placement: OverlayPlacement = OverlayPlacement.Home
  private var dragging = false
  private var queued = false
  private var grab: OverlayGrab? = null
  private var pending: PixelPoint? = null
  private var dragged = PixelPoint(0, 0)
  private var menu: MenuPlacement? = null
  private var reported = OverlayInsets(0, 0, Math.round(OverlayDims.PILL_BOTTOM_GAP * density))
  private var view: OverlayView? = null
  private var params: WindowManager.LayoutParams? = null
  private var position = OverlayPosition.Centre

  init {
    systemInsets()?.let { reported = it }
    val screen = screen()
    placement = store.load(OverlayOrientation.of(screen.width, screen.height))
  }

  fun glowMode(requested: GlowMode): GlowMode = OverlayGlowRule.mode(requested, placement, dragging)

  fun attach(target: OverlayView, layout: WindowManager.LayoutParams, wanted: OverlayPosition) {
    view = target
    params = layout
    position = wanted
    target.drag = this
    target.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> apply() }
    apply()
  }

  fun detach() {
    cancelFrame()
    view?.drag = null
    view = null
    params = null
    dragging = false
    grab = null
    menu = null
  }

  fun reset() {
    placement = OverlayPlacement.Home
    store.clear()
    apply()
    onGlowRule()
  }

  override fun reconfigured() {
    systemInsets()?.let { reported = it }
    val screen = screen()
    placement = store.load(OverlayOrientation.of(screen.width, screen.height))
    apply()
    onGlowRule()
  }

  override fun begin(rawX: Float, rawY: Float) {
    if (view == null) return
    val start = origin(pillSize(), screen())
    grab = OverlayGrab.at(rawX, rawY, start)
    dragged = start
    pending = null
    menu = null
    dragging = true
    apply()
    onGlowRule()
  }

  override fun move(rawX: Float, rawY: Float) {
    val current = grab ?: return
    if (!dragging) return
    pending = current.origin(rawX, rawY)
    if (queued) return
    queued = true
    choreographer.postFrameCallback(tick)
  }

  override fun end() {
    if (!dragging) return
    cancelFrame()
    val screen = screen()
    val size = pillSize()
    val area = areaOf(screen)
    pending?.let { dragged = OverlayDrag.clamp(it, size, area) }
    pending = null
    placement = OverlayDrag.settle(dragged, homePoint(size, screen), size, area, density)
    dragging = false
    grab = null
    store.save(OverlayOrientation.of(screen.width, screen.height), placement)
    apply()
    onGlowRule()
  }

  override fun insetsAccepted(): Boolean = !dragging && placement is OverlayPlacement.Home

  override fun insetsChanged(insets: OverlayInsets) {
    reported = insets
    apply()
  }

  override fun menuFor(tray: PillSize, gap: Int): MenuPlacement {
    val screen = screen()
    val size = pillSize()
    val at = origin(size, screen)
    val pill = PixelBox(at.x, at.y, at.x + size.width, at.y + size.height)
    return OverlayMenu.place(pill, tray, gap, areaOf(screen))
  }

  override fun menuShown(placement: MenuPlacement?) {
    menu = placement
    apply()
  }

  private fun flush() {
    queued = false
    val target = pending ?: return
    pending = null
    dragged = OverlayDrag.clamp(target, pillSize(), areaOf(screen()))
    apply()
  }

  private fun cancelFrame() {
    choreographer.removeFrameCallback(tick)
    queued = false
  }

  private fun apply() {
    val target = view ?: return
    val layout = params ?: return
    val before = Triple(layout.gravity, layout.x, layout.y)
    if (absolute()) free(layout, target) else home(layout)
    if (before != Triple(layout.gravity, layout.x, layout.y) && target.parent != null) manager.updateViewLayout(target, layout)
  }

  private fun absolute(): Boolean =
    dragging || placement is OverlayPlacement.Free || (menu?.shift ?: 0) != 0

  private fun origin(size: PillSize, screen: ScreenFacts): PixelPoint {
    if (dragging) return dragged
    val current = placement
    if (current is OverlayPlacement.Free) return OverlayDrag.originOf(current.at, size, areaOf(screen))
    return homePoint(size, screen)
  }

  private fun homePoint(size: PillSize, screen: ScreenFacts): PixelPoint =
    OverlayDrag.home(position, size, screen.width, screen.insets, areaOf(screen), density)

  private fun home(layout: WindowManager.LayoutParams) {
    layout.gravity = Gravity.BOTTOM or when (position) {
      OverlayPosition.Centre -> Gravity.CENTER_HORIZONTAL
      OverlayPosition.Left -> Gravity.START
      OverlayPosition.Right -> Gravity.END
    }
    layout.x = if (position == OverlayPosition.Centre) 0 else Math.round(OverlayDims.PILL_SCREEN_MARGIN * density)
    layout.y = 0
  }

  private fun free(layout: WindowManager.LayoutParams, target: OverlayView) {
    val screen = screen()
    val size = pillSize()
    val at = origin(size, screen)
    val box = target.pillFrame() ?: estimate(size)
    val viewHeight = if (target.height == 0) box.bottom + shadow() else target.height
    layout.gravity = Gravity.BOTTOM or Gravity.START
    layout.x = at.x - box.left
    layout.y = screen.height - (at.y + size.height) - (viewHeight - box.bottom)
  }

  private fun estimate(size: PillSize): PixelBox = PixelBox(shadow(), shadow(), shadow() + size.width, shadow() + size.height)

  private fun shadow(): Int = Math.round(OverlayDims.SHADOW_MARGIN * density)

  private fun pillSize(): PillSize {
    val frame = view?.pillFrame()
    if (frame != null) return PillSize(frame.width, frame.height)
    return PillSize(Math.round(OverlayDims.PILL_MIN_WIDTH * density), Math.round(OverlayDims.PILL_HEIGHT * density))
  }

  private fun areaOf(screen: ScreenFacts): PixelBox = OverlayDrag.area(screen.width, screen.height, screen.insets, density)

  private fun systemInsets(): OverlayInsets? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return OverlayInsets.read(WindowInsetsCompat.toWindowInsetsCompat(manager.currentWindowMetrics.windowInsets), density)
  }

  private fun screen(): ScreenFacts {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = manager.currentWindowMetrics.bounds
      val top = systemInsets() ?: reported
      return ScreenFacts(bounds.width(), bounds.height(), reported.withTopOf(top))
    }
    val real = DisplayMetrics()
    @Suppress("DEPRECATION")
    manager.defaultDisplay.getRealMetrics(real)
    return ScreenFacts(real.widthPixels, real.heightPixels, reported)
  }

  private companion object {
    const val FILE = "expo.modules.healthconnect.overlay.placement"
  }
}
