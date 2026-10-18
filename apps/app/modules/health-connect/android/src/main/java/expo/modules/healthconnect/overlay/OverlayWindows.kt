package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.Gravity
import android.view.WindowManager
import expo.modules.healthconnect.diagnostics.NativeLog

class OverlayLevels {
  val input = OverlayLevelTap()
  val output = OverlayLevelTap()

  fun clear() {
    input.clear()
    output.clear()
  }
}

data class OverlayLook(val theme: OverlayTheme, val glow: Boolean, val position: OverlayPosition, val reducedMotion: Boolean) {
  val style: OverlayStyle
    get() = OverlayStyle(theme, reducedMotion, glow)

  companion object {
    fun of(prefs: OverlayPhonePrefs): OverlayLook =
      OverlayLook(prefs.theme, prefs.glow, prefs.position, OverlayStyle.systemReducedMotion())
  }
}

class OverlayWindows(context: Context, private val actions: OverlayActions, private val levels: OverlayLevels) {
  private val context = context.applicationContext
  private val manager = this.context.getSystemService(WindowManager::class.java)
  private val density = this.context.resources.displayMetrics.density
  private var pill: OverlayView? = null
  private var glow: OverlayView? = null
  private var look: OverlayLook? = null

  fun render(view: OverlayViewState, prefs: OverlayPhonePrefs): Boolean {
    if (view.state == OverlayState.Hidden) {
      hide()
      return true
    }
    val wanted = OverlayLook.of(prefs)
    if (wanted != look || pill == null) {
      removeNow()
      if (!add(wanted)) return false
    }
    glow?.render(view)
    pill?.render(view)
    return true
  }

  fun hide() {
    glow?.render(OVERLAY_HIDDEN)
    pill?.render(OVERLAY_HIDDEN)
  }

  fun removeNow() {
    glow?.let(::remove)
    pill?.let(::remove)
    look = null
  }

  private fun add(wanted: OverlayLook): Boolean {
    val glowView = if (wanted.glow) viewOf(OverlayParts.Glow, wanted) else null
    val pillView = viewOf(OverlayParts.Pill, wanted)
    try {
      glowView?.let { manager.addView(it, glowParams()) }
      manager.addView(pillView, pillParams(wanted.position))
    } catch (failure: WindowManager.BadTokenException) {
      return refused(failure, glowView)
    } catch (failure: SecurityException) {
      return refused(failure, glowView)
    }
    glow = glowView
    pill = pillView
    look = wanted
    return true
  }

  private fun refused(failure: Exception, added: OverlayView?): Boolean {
    NativeLog.warn(SCOPE, "window.refused", failure)
    added?.takeIf { it.isAttachedToWindow }?.let { manager.removeViewImmediate(it) }
    return false
  }

  private fun viewOf(parts: OverlayParts, wanted: OverlayLook): OverlayView =
    OverlayView(context, parts, wanted.style, actions).apply {
      setLevelSources(levels.input, levels.output)
      onHidden = Runnable { remove(this) }
    }

  private fun remove(view: OverlayView) {
    view.release()
    if (view.isAttachedToWindow) manager.removeViewImmediate(view)
    if (view === pill) pill = null
    if (view === glow) glow = null
    if (pill == null && glow == null) look = null
  }

  private fun pillParams(position: OverlayPosition): WindowManager.LayoutParams =
    base(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, PILL_FLAGS).apply {
      gravity = Gravity.BOTTOM or horizontal(position)
      x = if (position == OverlayPosition.Centre) 0 else Math.round(OverlayDims.PILL_SCREEN_MARGIN * density)
    }

  private fun glowParams(): WindowManager.LayoutParams =
    base(WindowManager.LayoutParams.MATCH_PARENT, Math.round(OverlayDims.GLOW_HEIGHT * density), GLOW_FLAGS).apply {
      gravity = Gravity.BOTTOM
      alpha = GLOW_ALPHA
    }

  private fun base(width: Int, height: Int, flags: Int): WindowManager.LayoutParams =
    WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags, PixelFormat.TRANSLUCENT).apply {
      title = TITLE
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        fitInsetsTypes = 0
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      }
    }

  private fun horizontal(position: OverlayPosition): Int = when (position) {
    OverlayPosition.Centre -> Gravity.CENTER_HORIZONTAL
    OverlayPosition.Left -> Gravity.START
    OverlayPosition.Right -> Gravity.END
  }

  private companion object {
    const val SCOPE = "overlay"
    const val TITLE = "SmartEverything voice"
    const val GLOW_ALPHA = 0.8f
    const val PILL_FLAGS = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
      WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
    const val GLOW_FLAGS = WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
  }
}
