package expo.modules.healthconnect.overlay

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Rect
import android.graphics.Region
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
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
  private val tray = if (parts == OverlayParts.Glow) null else OverlayTrayView(context, palette, { actions.onTile(it) }, { actions.onOpen() })
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

  var onHidden: Runnable? = null

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
    insets = next
    applyInsets()
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

  fun toggleTray() {
    if (trayOpen) closeTray() else openTray()
  }

  private fun trayWidth(): Int = Math.round(OverlayTrayModel.width(resources.displayMetrics.widthPixels / density) * density)

  private fun openTray() {
    val menu = tray ?: return
    val data = last?.tray ?: return
    menu.bind(data, System.currentTimeMillis())
    trayOpen = true
    pill?.setTrayOpen(true)
    menu.visibility = VISIBLE
    menu.alpha = 0f
    menu.translationY = if (style.reducedMotion) 0f else OverlayMotion.TRAY_RISE_DP * density
    val duration = if (style.reducedMotion) OverlayMotion.REDUCED_FADE_MS else OverlayMotion.TRAY_MS
    menu.animate().alpha(1f).translationY(0f).setDuration(duration).setInterpolator(DecelerateInterpolator()).start()
  }

  private fun closeTray() {
    if (!trayOpen) return
    trayOpen = false
    tray?.animate()?.cancel()
    tray?.visibility = GONE
    pill?.setTrayOpen(false)
  }

  private fun syncTray(next: OverlayViewState, previous: OverlayViewState?) {
    val data = next.tray
    if (data == null) {
      closeTray()
    } else if (trayOpen && data != previous?.tray) {
      tray?.bind(data, System.currentTimeMillis())
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) closeTray()
    return super.onTouchEvent(event)
  }

  fun render(next: OverlayViewState) {
    val previous = last
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
    params.bottomMargin = insets.bottom
    params.leftMargin = insets.left
    params.rightMargin = insets.right
    target.layoutParams = params
    applyTrayInsets()
  }

  private fun applyTrayInsets() {
    val menu = tray ?: return
    val params = menu.layoutParams as? FrameLayout.LayoutParams ?: return
    params.bottomMargin = insets.bottom + Math.round((OverlayDims.PILL_HEIGHT + OverlayDims.TRAY_GAP) * density)
    params.leftMargin = insets.left
    params.rightMargin = insets.right
    menu.layoutParams = params
  }

  private inner class ViewActions : OverlayActions {
    override fun onControl(control: OverlayControl) {
      if (control == OverlayControl.More) toggleTray() else actions.onControl(control)
    }

    override fun onOpen() = actions.onOpen()

    override fun onTile(tile: OverlayTile) = actions.onTile(tile)
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

  override fun onScreenStateChanged(screenState: Int) {
    super.onScreenStateChanged(screenState)
    screenOn = screenState == SCREEN_STATE_ON
    if (screenOn) ensureFrames() else stopFrames()
  }

  companion object {
    private const val PILL_GRAVITY = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
    private const val FIRST_FRAME_MS = 16.0
    private const val NANOS_PER_MS = 1_000_000.0
  }
}
