package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

object RibbonShape {
  val WEIGHTS = doubleArrayOf(0.3, 0.5, 0.7, 0.88, 1.0, 0.88, 0.7, 0.5, 0.3)
  val METER_WEIGHTS = doubleArrayOf(0.5, 0.8, 1.0, 0.8, 0.5)
  const val BAR_SPAN = 24.0
  const val BAR_BASE = 4.0
  const val BAR_BOX = 28.0
  const val WOBBLE_BASE = 0.85
  const val WOBBLE_SPAN = 0.15
  const val WOBBLE_FROM = 5.0
  const val WOBBLE_TO = 4.0
  const val WOBBLE_PHASE = 1.3
  const val GAIN = 1.05
  const val CENTRE_MIX = 0.62
  const val SIDE_MIX = 0.19
  const val STIFFNESS_SPREAD = 0.06
  const val STIFFNESS_PHASE = 2.1
  const val MOVING_VELOCITY = 0.01
  const val MOVING_OFFSET = 0.004
  const val MS_PER_SECOND = 1000.0

  fun quantise(level: Double): Double =
    Math.round(level.coerceIn(0.0, 1.0) * OverlayMotion.REDUCED_STEPS) / OverlayMotion.REDUCED_STEPS.toDouble()

  fun target(index: Int, level: Double, seconds: Double): Double {
    if (level <= OverlayMotion.RIBBON_ACTIVE) return 0.0
    val phase = seconds * (WOBBLE_FROM + index * WOBBLE_TO / (WEIGHTS.size - 1)) + index * WOBBLE_PHASE
    val wobble = WOBBLE_BASE + WOBBLE_SPAN * sin(phase)
    return min(1.0, WEIGHTS[index] * level * wobble * GAIN)
  }

  fun restFraction(thinking: Boolean): Float =
    if (thinking) OverlayMotion.RIBBON_THINKING_REST else (BAR_BASE / BAR_BOX).toFloat()

  fun barFraction(position: Double, rest: Float): Float =
    max(rest.toDouble(), (BAR_BASE + BAR_SPAN * position) / BAR_BOX).toFloat()

  fun meterFraction(index: Int, step: Double): Float =
    max(OverlayDims.METER_BAR_MIN / OverlayDims.METER_HEIGHT, (METER_WEIGHTS[index] * step).toFloat())
}

class RibbonMotion(private val reduced: Boolean) {
  val positions = DoubleArray(RibbonShape.WEIGHTS.size)
  private val velocities = DoubleArray(RibbonShape.WEIGHTS.size)
  private val targets = DoubleArray(RibbonShape.WEIGHTS.size)
  private var seconds = 0.0
  private var sinceStep = 0.0
  var step = 0.0
    private set

  fun reset() {
    positions.fill(0.0)
    velocities.fill(0.0)
    step = 0.0
    sinceStep = 0.0
  }

  fun advance(dtMs: Double, level: Double): Boolean {
    val stepMs = minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    if (reduced) return advanceStepped(stepMs, level)
    seconds += stepMs / RibbonShape.MS_PER_SECOND
    return advanceSprings(stepMs / RibbonShape.MS_PER_SECOND, level)
  }

  private fun advanceStepped(stepMs: Double, level: Double): Boolean {
    sinceStep += stepMs
    if (sinceStep < OverlayMotion.REDUCED_STEP_MS) return false
    sinceStep = 0.0
    val next = RibbonShape.quantise(level)
    val changed = next != step
    step = next
    for (i in positions.indices) positions[i] = RibbonShape.WEIGHTS[i] * next
    return changed
  }

  private fun advanceSprings(dt: Double, level: Double): Boolean {
    val n = positions.size
    for (i in 0 until n) targets[i] = RibbonShape.target(i, level, seconds)
    var moving = false
    for (i in 0 until n) {
      val goal = RibbonShape.CENTRE_MIX * targets[i] +
        RibbonShape.SIDE_MIX * targets[max(i - 1, 0)] +
        RibbonShape.SIDE_MIX * targets[min(i + 1, n - 1)]
      val k = OverlayMotion.RIBBON_STIFFNESS * (1 + RibbonShape.STIFFNESS_SPREAD * sin(i * RibbonShape.STIFFNESS_PHASE))
      velocities[i] += (-k * (positions[i] - goal) - OverlayMotion.RIBBON_DAMPING * velocities[i]) * dt
      positions[i] = max(0.0, positions[i] + velocities[i] * dt)
      if (abs(velocities[i]) > RibbonShape.MOVING_VELOCITY || abs(positions[i] - targets[i]) > RibbonShape.MOVING_OFFSET) {
        moving = true
      }
    }
    return moving
  }

  fun quantiseMeter(level: Double): Double = RibbonShape.quantise(level)
}

enum class RibbonKind { Ribbon, Meter }

class OverlayRibbonView(context: Context, private val palette: OverlayPalette, reduced: Boolean) : View(context) {
  private val density = resources.displayMetrics.density
  private val motion = RibbonMotion(reduced)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var kind = RibbonKind.Ribbon
  private var colour = palette.primary
  private var thinking = false
  private var flat = false
  private var meterStep = 0.0
  private var meterSince = 0.0
  private var moving = false

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  val widthDp: Float
    get() = if (kind == RibbonKind.Ribbon) OverlayDims.RIBBON_WIDTH else OverlayDims.METER_WIDTH

  fun bind(kind: RibbonKind, orb: OrbState, muted: Boolean, level: LevelSource?) {
    this.kind = kind
    thinking = orb == OrbState.Thinking
    flat = muted && level == null
    colour = when {
      flat -> palette.faint
      level == LevelSource.Output -> palette.viz1
      else -> palette.primary
    }
    motion.reset()
    meterStep = 0.0
    paint.shader = null
    requestLayout()
    invalidate()
  }

  fun animating(): Boolean = moving

  fun advance(dtMs: Double, level: Double) {
    val lv = if (flat) 0.0 else level
    if (kind == RibbonKind.Meter) {
      advanceMeter(dtMs, lv)
      return
    }
    val before = moving
    moving = motion.advance(dtMs, lv)
    if (moving || before) invalidate()
  }

  private fun advanceMeter(dtMs: Double, level: Double) {
    meterSince += dtMs
    if (meterSince < OverlayMotion.METER_STEP_MS) return
    meterSince = 0.0
    val next = motion.quantiseMeter(level)
    if (next == meterStep) return
    meterStep = next
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val h = if (kind == RibbonKind.Ribbon) OverlayDims.RIBBON_HEIGHT else OverlayDims.METER_HEIGHT
    setMeasuredDimension(Math.round(widthDp * density), Math.round(h * density))
  }

  override fun onDraw(canvas: Canvas) {
    if (paint.shader == null) paint.shader = gradient()
    if (kind == RibbonKind.Ribbon) drawRibbon(canvas) else drawMeter(canvas)
  }

  private fun drawRibbon(canvas: Canvas) {
    val rest = RibbonShape.restFraction(thinking)
    val barW = OverlayDims.RIBBON_BAR * density
    val gap = OverlayDims.RIBBON_GAP * density
    val radius = OverlayDims.RIBBON_BAR_RADIUS * density
    for (i in motion.positions.indices) {
      val fraction = RibbonShape.barFraction(if (flat) 0.0 else motion.positions[i], rest)
      draw(canvas, i * (barW + gap), barW, fraction * height, radius)
    }
  }

  private fun drawMeter(canvas: Canvas) {
    val barW = OverlayDims.METER_BAR * density
    val gap = OverlayDims.METER_GAP * density
    for (i in RibbonShape.METER_WEIGHTS.indices) {
      val fraction = RibbonShape.meterFraction(i, if (flat) 0.0 else meterStep)
      draw(canvas, i * (barW + gap), barW, fraction * height, barW / 2f)
    }
  }

  private fun draw(canvas: Canvas, left: Float, barW: Float, barH: Float, radius: Float) {
    val top = (height - barH) / 2f
    box.set(left, top, left + barW, top + barH)
    canvas.drawRoundRect(box, radius, radius, paint)
  }

  private fun gradient(): Shader {
    val light = blend(colour, WHITE, LIGHTEN)
    return LinearGradient(0f, 0f, 0f, height.toFloat(), light, colour, Shader.TileMode.CLAMP)
  }

  private fun blend(from: Int, to: Int, mix: Float): Int {
    val r = Math.round(((from shr RED) and CHANNEL) * (1 - mix) + ((to shr RED) and CHANNEL) * mix)
    val g = Math.round(((from shr GREEN) and CHANNEL) * (1 - mix) + ((to shr GREEN) and CHANNEL) * mix)
    val b = Math.round((from and CHANNEL) * (1 - mix) + (to and CHANNEL) * mix)
    return (OPAQUE shl ALPHA) or (r shl RED) or (g shl GREEN) or b
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    paint.shader = null
  }

  companion object {
    private const val LIGHTEN = 0.3f
    private const val WHITE = -0x1
    private const val RED = 16
    private const val GREEN = 8
    private const val ALPHA = 24
    private const val CHANNEL = 0xFF
    private const val OPAQUE = 0xFF
  }
}
