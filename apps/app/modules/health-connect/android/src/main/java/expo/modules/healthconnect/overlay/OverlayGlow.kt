package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View
import kotlin.math.abs
import kotlin.math.exp

class GlowFrame {
  var scaleY = 0f
  var opacity = 0f
  var rim = 0f
  var bloomScale = 1f
  var bloomOpacity = 1f
  var master = 0f
  val blobX = FloatArray(BLOBS)

  companion object {
    const val BLOBS = 3
  }
}

object GlowMath {
  private val LISTENING_X = floatArrayOf(0.25f, 0.525f, 0.75f)
  private val SHIMMER_X = floatArrayOf(0.40f, 0.50f, 0.60f)
  private val DRIFT_FROM = floatArrayOf(-0.05f, -0.025f, 0.05f)
  private val DRIFT_TO = floatArrayOf(0.05f, 0.025f, -0.05f)
  private const val BLOB_SETTLE_MS = 230.0
  private const val BLOB_EPSILON = 0.0005f

  fun restX(mode: GlowMode): FloatArray = if (mode == GlowMode.Shimmer) SHIMMER_X else LISTENING_X

  fun drifts(mode: GlowMode): Boolean =
    mode == GlowMode.Listening || mode == GlowMode.Speaking || mode == GlowMode.Bloom

  fun periodMs(mode: GlowMode): Long =
    if (mode == GlowMode.Speaking) OverlayMotion.GLOW_DRIFT_SPEAKING_MS else OverlayMotion.GLOW_DRIFT_LISTENING_MS

  fun ease(x: Float): Float = x * x * (3f - 2f * x)

  fun easeOut(x: Float): Float = 1f - (1f - x) * (1f - x)

  fun driftOffset(index: Int, elapsedMs: Double, periodMs: Long): Float {
    val cycle = elapsedMs % (2.0 * periodMs) / periodMs
    val u = (if (cycle > 1.0) 2.0 - cycle else cycle).toFloat()
    val e = ease(u)
    return DRIFT_FROM[index] + (DRIFT_TO[index] - DRIFT_FROM[index]) * e
  }

  fun bloomScale(elapsedMs: Double): Float {
    val t = (elapsedMs / OverlayMotion.GLOW_BLOOM_MS).toFloat().coerceIn(0f, 1f)
    val peak = OverlayMotion.GLOW_BLOOM_PEAK_AT
    if (t < peak) return OverlayMotion.GLOW_BLOOM_PEAK * easeOut(t / peak)
    val back = ease((t - peak) / (1f - peak))
    return OverlayMotion.GLOW_BLOOM_PEAK + (1f - OverlayMotion.GLOW_BLOOM_PEAK) * back
  }

  fun bloomOpacity(elapsedMs: Double): Float {
    val t = (elapsedMs / OverlayMotion.GLOW_BLOOM_MS).toFloat().coerceIn(0f, 1f)
    val peak = OverlayMotion.GLOW_BLOOM_PEAK_AT
    return if (t < peak) easeOut(t / peak) else 1f
  }

  fun shimmer(elapsedMs: Double): Float {
    val cycle = elapsedMs % (2.0 * OverlayMotion.GLOW_SHIMMER_MS) / OverlayMotion.GLOW_SHIMMER_MS
    val u = (if (cycle > 1.0) 2.0 - cycle else cycle).toFloat()
    val from = OverlayMotion.GLOW_SHIMMER_FROM
    return from + (OverlayMotion.GLOW_SHIMMER_TO - from) * ease(u)
  }

  fun staticScale(): Float = OverlayDims.GLOW_STATIC_HEIGHT / OverlayDims.GLOW_HEIGHT

  fun approach(current: Float, target: Float, dtMs: Double): Float {
    val next = current + (target - current) * (1.0 - exp(-dtMs / BLOB_SETTLE_MS)).toFloat()
    return if (abs(target - next) < BLOB_EPSILON) target else next
  }
}

class GlowMotion(private val still: Boolean) {
  val frame = GlowFrame()
  var mode = GlowMode.Off
    private set
  private var driftMs = 0.0
  private var shimmerMs = 0.0
  private var bloomMs = OverlayMotion.GLOW_BLOOM_MS.toDouble()
  private var visible = false
  private var requested = GlowMode.Off
  private var level = 0.0

  init {
    GlowMath.restX(GlowMode.Listening).copyInto(frame.blobX)
    compute()
  }

  fun set(mode: GlowMode, enabled: Boolean) {
    val on = enabled && mode != GlowMode.Off
    val shown = if (on) mode else GlowMode.Off
    if (shown == GlowMode.Bloom && requested != GlowMode.Bloom && !still) bloomMs = 0.0
    requested = shown
    if (on) this.mode = mode
    visible = on
    compute()
  }

  fun animating(): Boolean {
    val fading = frame.master != if (visible) 1f else 0f
    if (!visible) return fading
    val moving = still.not() && (GlowMath.drifts(mode) || mode == GlowMode.Shimmer)
    return fading || moving || bloomMs < OverlayMotion.GLOW_BLOOM_MS || blobsSettling()
  }

  fun advance(dtMs: Double, level: Double) {
    this.level = level
    val step = minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    val fade = (step / (if (still) OverlayMotion.REDUCED_FADE_MS else OverlayMotion.GLOW_FADE_MS)).toFloat()
    val goal = if (visible) 1f else 0f
    frame.master = if (frame.master < goal) minOf(goal, frame.master + fade) else maxOf(goal, frame.master - fade)
    if (!still) {
      driftMs += step
      shimmerMs += step
      bloomMs = minOf(bloomMs + step, OverlayMotion.GLOW_BLOOM_MS.toDouble())
      settleBlobs(step)
    }
    compute()
  }

  private fun settleBlobs(step: Double) {
    val target = GlowMath.restX(mode)
    for (i in 0 until GlowFrame.BLOBS) {
      val rest = frame.blobX[i]
      val moved = GlowMath.approach(rest, target[i], step)
      frame.blobX[i] = moved
    }
  }

  private fun blobsSettling(): Boolean {
    val target = GlowMath.restX(mode)
    return (0 until GlowFrame.BLOBS).any { frame.blobX[it] != target[it] }
  }

  private fun compute() {
    val f = frame
    val thinking = mode == GlowMode.Shimmer
    if (still) {
      f.scaleY = GlowMath.staticScale()
      f.opacity = if (thinking) OverlayMotion.GLOW_STATIC_THINKING_OPACITY else OverlayMotion.GLOW_STATIC_OPACITY
      f.rim = 0f
      f.bloomScale = 1f
      f.bloomOpacity = 1f
      return
    }
    val l = level.toFloat().coerceIn(0f, 1f)
    if (thinking) {
      f.scaleY = OverlayMotion.GLOW_THINKING_SCALE
      f.opacity = GlowMath.shimmer(shimmerMs)
      f.rim = OverlayMotion.GLOW_RIM_THINKING
    } else {
      f.scaleY = OverlayMotion.GLOW_LEVEL_SCALE_REST + OverlayMotion.GLOW_LEVEL_SCALE_SPAN * l
      f.opacity = OverlayMotion.GLOW_LEVEL_OPACITY_REST + OverlayMotion.GLOW_LEVEL_OPACITY_SPAN * l
      f.rim = OverlayMotion.GLOW_RIM_REST + OverlayMotion.GLOW_RIM_SPAN * l
    }
    f.bloomScale = GlowMath.bloomScale(bloomMs)
    f.bloomOpacity = GlowMath.bloomOpacity(bloomMs)
  }

  fun blobCentre(index: Int): Float {
    val drift = if (still || !GlowMath.drifts(mode)) 0f else GlowMath.driftOffset(index, driftMs, GlowMath.periodMs(mode))
    return frame.blobX[index] + drift
  }
}

class OverlayGlowView(context: Context, private val still: Boolean, private val palette: OverlayPalette) :
  View(context) {
  private val motion = GlowMotion(still)
  private val blobPaints = Array(GlowFrame.BLOBS) { Paint(Paint.ANTI_ALIAS_FLAG) }
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val matrix = Matrix()
  private val blobColours = intArrayOf(OverlayTokens.GLOW_TEAL, OverlayTokens.GLOW_AMBER, OverlayTokens.GLOW_CORAL)

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    isClickable = false
    isFocusable = false
    setWillNotDraw(false)
  }

  fun set(mode: GlowMode, enabled: Boolean) = motion.set(mode, enabled)

  fun animating(): Boolean = motion.animating()

  fun advance(dtMs: Double, level: Double) {
    motion.advance(dtMs, level)
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    for (i in 0 until GlowFrame.BLOBS) {
      val clear = Color.argb(0, Color.red(blobColours[i]), Color.green(blobColours[i]), Color.blue(blobColours[i]))
      val strong = Color.argb(
        Math.round(OverlayTokens.GLOW_BLOB_ALPHA * ALPHA_MAX),
        Color.red(blobColours[i]),
        Color.green(blobColours[i]),
        Color.blue(blobColours[i]),
      )
      blobPaints[i].shader = RadialGradient(0f, 0f, 1f, intArrayOf(strong, clear), null, Shader.TileMode.CLAMP)
    }
    val none = Color.argb(0, Color.red(blobColours[0]), Color.green(blobColours[0]), Color.blue(blobColours[0]))
    rimPaint.shader = LinearGradient(
      w * RIM_INSET,
      0f,
      w * (1f - RIM_INSET),
      0f,
      intArrayOf(none, blobColours[0], blobColours[1], blobColours[2], none),
      floatArrayOf(0f, RIM_TEAL_AT, RIM_AMBER_AT, RIM_CORAL_AT, 1f),
      Shader.TileMode.CLAMP,
    )
  }

  override fun onDraw(canvas: Canvas) {
    val frame = motion.frame
    val alpha = frame.master * palette.glowCap
    if (alpha <= 0f || width == 0) return
    val w = width.toFloat()
    val h = height.toFloat()
    val reach = h * frame.scaleY * frame.bloomScale
    val half = w * BLOB_HALF_WIDTH
    val paintAlpha = (alpha * frame.opacity * frame.bloomOpacity).coerceIn(0f, 1f)
    for (i in 0 until GlowFrame.BLOBS) {
      matrix.setScale(half, reach)
      matrix.postTranslate(motion.blobCentre(i) * w, h)
      val paint = blobPaints[i]
      paint.shader.setLocalMatrix(matrix)
      paint.alpha = Math.round(paintAlpha * ALPHA_MAX)
      canvas.drawRect(0f, 0f, w, h, paint)
    }
    drawRim(canvas, alpha, w, h)
  }

  private fun drawRim(canvas: Canvas, alpha: Float, w: Float, h: Float) {
    val rim = motion.frame.rim
    if (still || rim <= 0f) return
    val thickness = OverlayDims.GLOW_RIM * resources.displayMetrics.density
    rimPaint.alpha = Math.round((alpha * rim).coerceIn(0f, 1f) * ALPHA_MAX)
    canvas.drawRect(w * RIM_INSET, h - thickness, w * (1f - RIM_INSET), h, rimPaint)
  }

  companion object {
    private const val ALPHA_MAX = 255
    private const val BLOB_HALF_WIDTH = 0.23f
    private const val RIM_INSET = 0.04f
    private const val RIM_TEAL_AT = 0.22f
    private const val RIM_AMBER_AT = 0.52f
    private const val RIM_CORAL_AT = 0.8f
  }
}
