package expo.modules.healthconnect.overlay

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.Configuration
import android.graphics.Rect
import android.graphics.Region
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import androidx.core.view.WindowInsetsCompat

enum class OverlayParts { Both, Pill, Glow }

class OverlayStyle(val theme: OverlayTheme, val reducedMotion: Boolean, val glow: Boolean) {
  companion object {
    fun systemReducedMotion(): Boolean = !ValueAnimator.areAnimatorsEnabled()
  }
}

class OverlayView(
  context: Context,
  private val parts: OverlayParts,
  private val style: OverlayStyle,
  private val actions: OverlayActions,
) : FrameLayout(context) {
  private val density = resources.displayMetrics.density
  private val palette = OverlayTokens.of(style.theme)
  private val glow = if (parts == OverlayParts.Pill) null else OverlayGlowView(context, style.reducedMotion, palette)
  private val pill = if (parts == OverlayParts.Glow) null else OverlayPillView(context, palette, style.reducedMotion, ViewActions())
  private val tray = if (parts == OverlayParts.Glow) null else OverlayTrayView(context, palette, { actions.onTile(it) }, { actions.onThinking(it) }, { actions.onOpen() })
  private val presence = OverlayPresence(style.reducedMotion)
  private val follower = OverlayLevelFollower()
  private val rest = OverlayRest()
  private val callback = Choreographer.FrameCallback { nanos -> onFrame(nanos) }
  private var input: OverlayLevelSource? = null
  private var output: OverlayLevelSource? = null
  private var source: OverlayLevelSource? = null
  private var last: OverlayViewState? = null
  private var insets = OverlayInsets(0, 0, Math.round(OverlayDims.PILL_BOTTOM_GAP * density))
  private var scheduled = false
  private var lastNanos = 0L
  private var screenOn = true
  private var trayOpen = false
  private var menuAt = MenuPlacement.Closed
  private var armed = false
  private var dragging = false
  private var downX = 0f
  private var downY = 0f
  private val slop = ViewConfiguration.get(context).scaledTouchSlop

  var onHidden: Runnable? = null
  var drag: OverlayDragSink? = null

  init {
    clipChildren = false
    clipToPadding = false
    visibility = GONE
    if (pill == null) importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    glow?.let { addView(it, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, Math.round(OverlayDims.GLOW_HEIGHT * density), Gravity.BOTTOM)) }
    pill?.let { addView(it, FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, PILL_GRAVITY)) }
    tray?.let { addView(it, FrameLayout.LayoutParams(trayWidth(), LayoutParams.WRAP_CONTENT, PILL_GRAVITY)) }
    tray?.visibility = GONE
    if (parts == OverlayParts.Pill) {
      val margin = Math.round(OverlayDims.SHADOW_MARGIN * density)
      setPadding(margin, margin, margin, margin)
    }
    setOnApplyWindowInsetsListener { _, windowInsets ->
      setInsets(OverlayInsets.read(WindowInsetsCompat.toWindowInsetsCompat(windowInsets, this), density))
      windowInsets
    }
    applyInsets()
  }

  fun setInsets(next: OverlayInsets) {
    if (next == insets) return
    if (drag?.insetsAccepted() == false) return
    insets = next
    applyInsets()
    drag?.insetsChanged(next)
  }

  fun pillFrame(): PixelBox? {
    val target = pill ?: return null
    if (target.width == 0) return null
    return PixelBox(target.left, target.top, target.right, target.bottom)
  }

  fun setLevelSources(inputSource: OverlayLevelSource?, outputSource: OverlayLevelSource?) {
    input?.setWake(null)
    output?.setWake(null)
    input = inputSource
    output = outputSource
    selectSource(last?.level)
  }

  fun touchRegion(out: Region): Boolean {
    val target = pill ?: return false
    if (target.width == 0) return false
    out.set(Rect(target.left, target.top, target.right, target.bottom))
    val menu = tray
    if (trayOpen && menu != null) out.union(Rect(menu.left, menu.top, menu.right, menu.bottom))
    return true
  }

  fun closeMenu() = closeTray()

  fun toggleTray() {
    if (trayOpen) closeTray() else openTray()
  }

  private fun trayWidth(): Int = Math.round(OverlayTrayModel.width(resources.displayMetrics.widthPixels / density) * density)

  private fun openTray() {
    val menu = tray ?: return
    val data = last?.tray ?: return
    menu.bind(data, System.currentTimeMillis())
    menu.measure(
      MeasureSpec.makeMeasureSpec(trayWidth(), MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
    )
    val gap = Math.round(OverlayDims.TRAY_GAP * density)
    menuAt = drag?.menuFor(PillSize(menu.measuredWidth, menu.measuredHeight), gap) ?: MenuPlacement.Closed
    drag?.menuShown(menuAt)
    applyInsets()
    trayOpen = true
    pill?.setTrayOpen(true)
    menu.visibility = VISIBLE
    menu.alpha = 0f
    val rise = if (menuAt.side == MenuSide.Above) OverlayMotion.TRAY_RISE_DP else -OverlayMotion.TRAY_RISE_DP
    menu.translationY = if (style.reducedMotion) 0f else rise * density
    val duration = if (style.reducedMotion) OverlayMotion.REDUCED_FADE_MS else OverlayMotion.TRAY_MS
    menu.animate().alpha(1f).translationY(0f).setDuration(duration).setInterpolator(DecelerateInterpolator()).start()
  }

  private fun closeTray() {
    if (!trayOpen) return
    trayOpen = false
    tray?.animate()?.cancel()
    tray?.visibility = GONE
    pill?.setTrayOpen(false)
    menuAt = MenuPlacement.Closed
    drag?.menuShown(null)
    applyInsets()
  }

  private fun syncTray(next: OverlayViewState, previous: OverlayViewState?) {
    val data = next.tray
    if (data == null) {
      closeTray()
    } else if (trayOpen && data != previous?.tray) {
      tray?.bind(data, System.currentTimeMillis())
    }
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    val sink = drag ?: return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        armed = onPill(event)
        downX = event.rawX
        downY = event.rawY
      }
      MotionEvent.ACTION_MOVE -> if (armed && !dragging && movedPastSlop(event)) {
        dragging = true
        closeTray()
        sink.begin(event.rawX, event.rawY)
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> armed = false
    }
    return dragging
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) closeTray()
    val sink = drag
    if (!dragging || sink == null) return super.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> sink.move(event.rawX, event.rawY)
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (event.actionMasked == MotionEvent.ACTION_UP) sink.move(event.rawX, event.rawY)
        dragging = false
        armed = false
        sink.end()
      }
    }
    return true
  }

  private fun onPill(event: MotionEvent): Boolean {
    val frame = pillFrame() ?: return false
    return event.x >= frame.left && event.x < frame.right && event.y >= frame.top && event.y < frame.bottom
  }

  private fun movedPastSlop(event: MotionEvent): Boolean =
    Math.abs(event.rawX - downX) > slop || Math.abs(event.rawY - downY) > slop

  fun render(next: OverlayViewState) {
    val previous = last
    if (next == previous && visibility == VISIBLE) return
    last = next
    if (next.state == OverlayState.Hidden) {
      closeTray()
      conceal()
      return
    }
    syncTray(next, previous)
    val appearing = presence.phase == PresencePhase.Hidden || previous == null || previous.state == OverlayState.Hidden
    val changed = previous?.state != next.state
    visibility = VISIBLE
    pill?.bind(next, changed && !appearing)
    glow?.set(next.glow, style.glow)
    selectSource(next.level)
    rest.silentMs = if (next.state == OverlayState.Thinking) OverlayMotion.REST_THINKING_MS else OverlayMotion.REST_SILENT_MS
    if (changed) rest.wake()
    if (appearing) pill?.ignite()
    presence.show()
    applyPresence()
    ensureFrames()
  }

  fun release() {
    stopFrames()
    input?.setWake(null)
    output?.setWake(null)
    input = null
    output = null
    source = null
  }

  private fun conceal() {
    if (visibility != VISIBLE) return
    selectSource(null)
    glow?.set(GlowMode.Off, false)
    presence.hide()
    rest.wake()
    if (presence.phase == PresencePhase.Hidden && glow?.animating() != true) finishHide() else ensureFrames()
  }

  private fun finishHide() {
    stopFrames()
    follower.reset()
    visibility = GONE
    onHidden?.run()
  }

  private fun selectSource(level: LevelSource?) {
    source?.setWake(null)
    source = when (level) {
      LevelSource.Input -> input
      LevelSource.Output -> output
      null -> null
    }
    source?.setWake(Runnable { post { wakeFrames() } })
  }

  private fun wakeFrames() {
    rest.wake()
    ensureFrames()
  }

  private fun applyInsets() {
    val target = pill ?: return
    val params = target.layoutParams as? FrameLayout.LayoutParams ?: return
    val menu = tray
    val below = menuAt.side == MenuSide.Below
    val reach = if (trayOpen && menu != null && below) menu.measuredHeight + trayGap() else 0
    params.bottomMargin = insets.bottom + reach
    params.leftMargin = insets.left + maxOf(0, -menuAt.shift)
    params.rightMargin = insets.right
    target.layoutParams = params
    applyTrayInsets()
  }

  private fun applyTrayInsets() {
    val menu = tray ?: return
    val params = menu.layoutParams as? FrameLayout.LayoutParams ?: return
    val above = menuAt.side == MenuSide.Above
    params.bottomMargin = insets.bottom + if (above) pillHeight() + trayGap() else 0
    params.leftMargin = insets.left + maxOf(0, menuAt.shift)
    params.rightMargin = insets.right
    menu.layoutParams = params
  }

  private fun trayGap(): Int = Math.round(OverlayDims.TRAY_GAP * density)

  private fun pillHeight(): Int = pill?.height?.takeIf { it > 0 } ?: Math.round(OverlayDims.PILL_HEIGHT * density)

  private inner class ViewActions : OverlayActions {
    override fun onControl(control: OverlayControl) {
      if (control == OverlayControl.More) toggleTray() else actions.onControl(control)
    }

    override fun onOpen() = actions.onOpen()

    override fun onTile(tile: OverlayTile) = actions.onTile(tile)

    override fun onThinking(level: VoiceLevel) = actions.onThinking(level)
  }

  private fun applyPresence() {
    val target = pill ?: return
    target.alpha = presence.alpha
    target.translationY = presence.rise * density
    target.scaleX = presence.scale
    target.scaleY = presence.scale
  }

  private fun wantsFrames(): Boolean {
    if (visibility != VISIBLE) return false
    if (presence.animating()) return true
    if (rest.resting) return false
    val live = source != null
    return live || pill?.animating() == true || glow?.animating() == true
  }

  private fun canRun(): Boolean = isAttachedToWindow && windowVisibility == View.VISIBLE && screenOn && wantsFrames()

  private fun ensureFrames() {
    if (scheduled || !canRun()) return
    scheduled = true
    lastNanos = 0
    Choreographer.getInstance().postFrameCallback(callback)
  }

  private fun stopFrames() {
    Choreographer.getInstance().removeFrameCallback(callback)
    scheduled = false
  }

  private fun onFrame(nanos: Long) {
    scheduled = false
    val gap = if (lastNanos == 0L) FIRST_FRAME_MS else (nanos - lastNanos) / NANOS_PER_MS
    lastNanos = nanos
    step(minOf(gap, OverlayMotion.MAX_STEP_MS))
    if (!canRun()) return
    scheduled = true
    if (style.reducedMotion && !presence.animating()) {
      Choreographer.getInstance().postFrameCallbackDelayed(callback, OverlayMotion.REDUCED_STEP_MS)
    } else {
      Choreographer.getInstance().postFrameCallback(callback)
    }
  }

  private fun step(dt: Double) {
    presence.advance(dt)
    applyPresence()
    val raw = source?.sample() ?: 0.0
    val level = follower.advance(raw, dt)
    val audible = level > 0.0 || raw >= OVERLAY_LEVEL_AUDIBLE
    if (!rest.advance(audible, dt)) {
      pill?.advance(dt, level)
      glow?.advance(dt, level)
    }
    val gone = last?.state == OverlayState.Hidden
    if (gone && presence.phase == PresencePhase.Hidden && glow?.animating() != true) finishHide()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    requestApplyInsets()
    ensureFrames()
  }

  override fun onDetachedFromWindow() {
    stopFrames()
    super.onDetachedFromWindow()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility == VISIBLE) ensureFrames() else stopFrames()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    drag?.reconfigured()
  }

  override fun onScreenStateChanged(screenState: Int) {
    super.onScreenStateChanged(screenState)
    screenOn = screenState == SCREEN_STATE_ON
    if (screenOn) ensureFrames() else stopFrames()
  }

  companion object {
    private const val PILL_GRAVITY = Gravity.BOTTOM or Gravity.START
    private const val FIRST_FRAME_MS = 16.0
    private const val NANOS_PER_MS = 1_000_000.0
  }
}
