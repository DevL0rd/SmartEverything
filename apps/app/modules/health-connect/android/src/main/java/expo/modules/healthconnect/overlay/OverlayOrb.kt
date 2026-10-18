package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

class OrbLoop(
  val swirlMs: Long,
  val pulseMs: Long,
  val breathe: Boolean,
  val haloMs: Long?,
  val gain: Double,
)

object OrbLoops {
  private val IDLE = OrbLoop(9000, 2600, false, null, 0.0)
  private val LISTENING = OrbLoop(6000, 1600, false, 1800, OverlayMotion.ORB_GAIN_LISTENING)
  private val THINKING = OrbLoop(1400, 900, true, null, 0.0)
  private val SPEAKING = OrbLoop(3500, 700, false, 1200, OverlayMotion.ORB_GAIN_SPEAKING)

  fun of(state: OrbState): OrbLoop =
    when (state) {
      OrbState.Idle -> IDLE
      OrbState.Listening -> LISTENING
      OrbState.Thinking -> THINKING
      OrbState.Speaking -> SPEAKING
    }
}

class OrbFrame {
  var scale = 1f
  var pulseScale = 1f
  var pulseAlpha = 1f
  var swirl = 0f
  var haloScale = 1f
  var haloAlpha = 0f
  var auraAlpha = 0f
  var auraScale = 1f
  var igniteScale = 1f
  var igniteAlpha = 1f
  var burstScale = 1f
  var burstAlpha = 0f
}

class OrbMotion(private val reduced: Boolean) {
  val frame = OrbFrame()
  private var loop = OrbLoops.of(OrbState.Idle)
  private var dim = false
  private var swirlMs = 0.0
  private var pulseMs = 0.0
  private var haloMs = 0.0
  private var ox = 1.0
  private var ov = 0.0
  private var igniteMs = IGNITE_DONE
  private var settled = true

  fun set(state: OrbState, dim: Boolean) {
    loop = OrbLoops.of(state)
    this.dim = dim
    settled = false
    compute(0.0)
  }

  fun ignite() {
    if (reduced) return
    igniteMs = 0.0
    compute(0.0)
  }

  fun animating(): Boolean {
    if (reduced) return false
    return !dim || !settled || igniteMs < IGNITE_DONE
  }

  fun advance(dtMs: Double, level: Double) {
    val step = minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    if (reduced) {
      compute(level)
      return
    }
    if (!dim) {
      swirlMs += step
      pulseMs += step
      haloMs += step
    }
    if (igniteMs < IGNITE_DONE) igniteMs = minOf(igniteMs + step, IGNITE_DONE)
    spring(step / MS_PER_SECOND, level)
    compute(level)
  }

  private fun spring(dt: Double, level: Double) {
    val target = if (dim) 1.0 else 1.0 + level.coerceIn(0.0, 1.0) * loop.gain
    ov += (-OverlayMotion.ORB_SPRING_STIFFNESS * (ox - target) - OverlayMotion.ORB_SPRING_DAMPING * ov) * dt
    ox += ov * dt
    settled = abs(ox - target) < SETTLE_POSITION && abs(ov) < SETTLE_VELOCITY
    if (settled) {
      ox = target
      ov = 0.0
    }
  }

  private fun compute(level: Double) {
    val f = frame
    val l = level.coerceIn(0.0, 1.0)
    f.scale = if (reduced) 1f else ox.toFloat()
    f.swirl = if (reduced || dim) 0f else ((swirlMs % loop.swirlMs) / loop.swirlMs * FULL_TURN).toFloat()
    pulse()
    halo()
    f.auraAlpha = if (dim) 0f else (AURA_BASE + AURA_SPAN * l).toFloat()
    f.auraScale = (AURA_SCALE_BASE + AURA_SCALE_SPAN * l).toFloat()
    ignitePose()
  }

  private fun pulse() {
    val f = frame
    if (reduced || dim) {
      f.pulseScale = 1f
      f.pulseAlpha = 1f
      return
    }
    val cycle = pulseMs % (2.0 * loop.pulseMs) / loop.pulseMs
    val u = (if (cycle > 1.0) 2.0 - cycle else cycle).toFloat()
    val e = GlowMath.ease(u)
    if (loop.breathe) {
      f.pulseScale = 1f
      f.pulseAlpha = BREATHE_FROM + (BREATHE_TO - BREATHE_FROM) * e
    } else {
      f.pulseScale = PULSE_SCALE_FROM + (PULSE_SCALE_TO - PULSE_SCALE_FROM) * e
      f.pulseAlpha = PULSE_ALPHA_FROM + (1f - PULSE_ALPHA_FROM) * e
    }
  }

  private fun halo() {
    val f = frame
    val period = loop.haloMs
    if (reduced || dim || period == null) {
      f.haloAlpha = 0f
      f.haloScale = 1f
      return
    }
    val t = ((haloMs % period) / period).toFloat()
    val e = GlowMath.easeOut(t)
    f.haloScale = HALO_SCALE_FROM + (HALO_SCALE_TO - HALO_SCALE_FROM) * e
    f.haloAlpha = HALO_ALPHA_FROM * (1f - e)
  }

  private fun ignitePose() {
    val f = frame
    if (igniteMs >= IGNITE_DONE) {
      f.igniteScale = 1f
      f.igniteAlpha = 1f
      f.burstAlpha = 0f
      return
    }
    val p = OverlaySpring.position(igniteMs, OverlayMotion.ENTER_DAMPING, OverlayMotion.ENTER_STIFFNESS).toFloat()
    f.igniteScale = IGNITE_FROM + (1f - IGNITE_FROM) * p
    f.igniteAlpha = (igniteMs / IGNITE_FADE_MS).toFloat().coerceIn(0f, 1f)
    val b = GlowMath.easeOut((igniteMs / OverlayMotion.ORB_BURST_MS).toFloat().coerceIn(0f, 1f))
    f.burstScale = BURST_FROM + (BURST_TO - BURST_FROM) * b
    f.burstAlpha = BURST_ALPHA * (1f - b)
  }

  companion object {
    const val FULL_TURN = 360.0
    const val MS_PER_SECOND = 1000.0
    const val SETTLE_POSITION = 0.0005
    const val SETTLE_VELOCITY = 0.002
    const val AURA_BASE = 0.2
    const val AURA_SPAN = 0.5
    const val AURA_SCALE_BASE = 0.9
    const val AURA_SCALE_SPAN = 0.35
    const val PULSE_SCALE_FROM = 0.94f
    const val PULSE_SCALE_TO = 1.04f
    const val PULSE_ALPHA_FROM = 0.55f
    const val BREATHE_FROM = 0.45f
    const val BREATHE_TO = 0.95f
    const val HALO_SCALE_FROM = 0.82f
    const val HALO_SCALE_TO = 1.32f
    const val HALO_ALPHA_FROM = 0.8f
    const val IGNITE_FROM = 0.55f
    const val IGNITE_FADE_MS = 160.0
    const val BURST_FROM = 0.9f
    const val BURST_TO = 1.6f
    const val BURST_ALPHA = 0.9f
    val IGNITE_DONE = OverlayMotion.ORB_BURST_MS.toDouble()
  }
}

class OverlayOrbView(context: Context, private val palette: OverlayPalette, reduced: Boolean) : View(context) {
  private val density = resources.displayMetrics.density
  private val motion = OrbMotion(reduced)
  private val sphere = Paint(Paint.ANTI_ALIAS_FLAG)
  private val swirlA = Paint(Paint.ANTI_ALIAS_FLAG)
  private val swirlB = Paint(Paint.ANTI_ALIAS_FLAG)
  private val shade = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val spec = Paint(Paint.ANTI_ALIAS_FLAG)
  private val aura = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val stop = Paint(Paint.ANTI_ALIAS_FLAG)
  private val clip = Path()
  private val scratch = Matrix()
  private var dim = false
  private var stoppable = false

  val extent: Float
    get() = EXTENT * density

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    buildPaints()
  }

  fun bind(state: OrbState, dim: Boolean, stoppable: Boolean, label: String?) {
    this.dim = dim
    this.stoppable = stoppable
    motion.set(state, dim)
    buildPaints()
    isClickable = stoppable
    isFocusable = stoppable
    contentDescription = if (stoppable) label else null
    importantForAccessibility = if (stoppable) IMPORTANT_FOR_ACCESSIBILITY_YES else IMPORTANT_FOR_ACCESSIBILITY_NO
    invalidate()
  }

  fun ignite() = motion.ignite()

  fun animating(): Boolean = motion.animating()

  fun advance(dtMs: Double, level: Double) {
    motion.advance(dtMs, level)
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val side = Math.round(extent)
    setMeasuredDimension(side, side)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!stoppable) return false
    val half = OverlayDims.ORB_TOUCH * density / 2f
    val inside = abs(event.x - width / 2f) <= half && abs(event.y - height / 2f) <= half
    if (event.actionMasked == MotionEvent.ACTION_DOWN && !inside) return false
    return super.onTouchEvent(event)
  }

  private fun buildPaints() {
    val r = ORB_RADIUS * density
    val d = density
    val core = if (dim) palette.faint else palette.primary
    val deep = if (dim) palette.surface3 else palette.primaryContainer
    val shine = withAlpha(if (dim) palette.surface2 else palette.shine, SHINE_ALPHA)
    sphere.shader = RadialGradient(
      SPHERE_CX * 2 * r,
      SPHERE_CY * 2 * r,
      SPHERE_R * 2 * r,
      intArrayOf(shine, core, deep),
      floatArrayOf(0f, SPHERE_CORE_AT, 1f),
      Shader.TileMode.CLAMP,
    )
    swirlA.shader = fade(if (dim) palette.faint else palette.viz1, SWIRL_A_ALPHA)
    swirlB.shader = fade(if (dim) palette.variant else palette.viz4, SWIRL_B_ALPHA)
    shade.shader = RadialGradient(
      r - SHADE_DX * d,
      r - SHADE_DY * d,
      r,
      intArrayOf(CLEAR, CLEAR, SHADE_COLOUR),
      floatArrayOf(0f, SHADE_FROM, 1f),
      Shader.TileMode.CLAMP,
    )
    spec.shader = fade(WHITE, SPEC_ALPHA)
    aura.shader = fade(palette.primary, 1f)
    ring.color = palette.primary
    rim.color = RIM_COLOUR
    stop.color = palette.onSurface
  }

  override fun onDraw(canvas: Canvas) {
    val f = motion.frame
    val radius = ORB_RADIUS * density
    canvas.save()
    canvas.translate(extent / 2f, extent / 2f)
    canvas.scale(f.igniteScale, f.igniteScale)
    drawAura(canvas, f, radius)
    drawHalo(canvas, f, radius)
    drawBurst(canvas, f, radius)
    canvas.scale(f.scale * f.pulseScale, f.scale * f.pulseScale)
    drawBody(canvas, f, radius)
    drawStop(canvas)
    canvas.restore()
  }

  private fun drawAura(canvas: Canvas, f: OrbFrame, radius: Float) {
    if (f.auraAlpha <= 0f) return
    val size = radius * AURA_RADIUS
    aura.alpha = Math.round(f.auraAlpha * palette.auraCap * f.igniteAlpha * ALPHA_MAX)
    aura.shader.setLocalMatrix(scratch.also { it.setScale(size * f.auraScale, size * f.auraScale) })
    canvas.drawCircle(0f, 0f, size * f.auraScale, aura)
  }

  private fun drawHalo(canvas: Canvas, f: OrbFrame, radius: Float) {
    if (f.haloAlpha <= 0f) return
    ring.strokeWidth = HALO_STROKE * density
    ring.alpha = Math.round(f.haloAlpha * f.igniteAlpha * ALPHA_MAX)
    canvas.drawCircle(0f, 0f, radius * f.haloScale - ring.strokeWidth / 2f, ring)
  }

  private fun drawBurst(canvas: Canvas, f: OrbFrame, radius: Float) {
    if (f.burstAlpha <= 0f) return
    ring.strokeWidth = HALO_STROKE * density
    ring.alpha = Math.round(f.burstAlpha * ALPHA_MAX)
    canvas.drawCircle(0f, 0f, radius * f.burstScale - ring.strokeWidth / 2f, ring)
  }

  private fun drawBody(canvas: Canvas, f: OrbFrame, radius: Float) {
    val alpha = Math.round(f.pulseAlpha * f.igniteAlpha * (if (dim) DIM_ALPHA else 1f) * ALPHA_MAX)
    canvas.save()
    canvas.translate(-radius, -radius)
    sphere.alpha = alpha
    canvas.drawCircle(radius, radius, radius, sphere)
    clip.reset()
    clip.addCircle(radius, radius, radius, Path.Direction.CW)
    canvas.save()
    canvas.clipPath(clip)
    canvas.rotate(f.swirl, radius, radius)
    drawBlob(canvas, swirlA, SWIRL_A_X, SWIRL_A_Y, SWIRL_A_R, alpha)
    drawBlob(canvas, swirlB, SWIRL_B_X, SWIRL_B_Y, SWIRL_B_R, alpha)
    canvas.restore()
    shade.alpha = alpha
    canvas.drawCircle(radius, radius, radius, shade)
    rim.strokeWidth = density
    rim.alpha = alpha
    canvas.drawCircle(radius, radius, radius - density / 2f, rim)
    drawSpec(canvas, alpha)
    canvas.restore()
  }

  private fun drawBlob(canvas: Canvas, paint: Paint, x: Float, y: Float, size: Float, alpha: Int) {
    val r = size * density
    paint.alpha = alpha
    paint.shader.setLocalMatrix(scratch.also { it.setScale(r, r) })
    canvas.save()
    canvas.translate(x * density, y * density)
    canvas.drawCircle(0f, 0f, r, paint)
    canvas.restore()
  }

  private fun drawSpec(canvas: Canvas, alpha: Int) {
    if (dim) return
    spec.alpha = alpha
    spec.shader.setLocalMatrix(null)
    canvas.save()
    canvas.translate((SPEC_X + SPEC_W / 2f) * density, (SPEC_Y + SPEC_H / 2f) * density)
    canvas.rotate(SPEC_ROTATE)
    canvas.scale(SPEC_W / 2f * density, SPEC_H / 2f * density)
    canvas.drawCircle(0f, 0f, 1f, spec)
    canvas.restore()
  }

  private fun drawStop(canvas: Canvas) {
    if (!stoppable || !(isPressed || isFocused)) return
    val half = OverlayDims.ORB_STOP * density / 2f
    val corner = STOP_RADIUS * density
    stop.alpha = Math.round(STOP_ALPHA * ALPHA_MAX)
    canvas.drawRoundRect(-half, -half, half, half, corner, corner, stop)
  }

  private fun fade(colour: Int, alpha: Float): Shader =
    RadialGradient(0f, 0f, 1f, intArrayOf(withAlpha(colour, alpha), withAlpha(colour, 0f)), null, Shader.TileMode.CLAMP)

  private fun withAlpha(colour: Int, alpha: Float): Int {
    val base = (colour ushr ALPHA_SHIFT) and ALPHA_MAX
    return (Math.round(base * alpha) shl ALPHA_SHIFT) or (colour and COLOUR_MASK)
  }

  companion object {
    const val EXTENT = 64f
    const val ORB_RADIUS = 20f
    const val ALPHA_MAX = 255
    const val ALPHA_SHIFT = 24
    const val COLOUR_MASK = 0x00FFFFFF
    const val CLEAR = 0x00000000
    const val WHITE = -0x1
    const val AURA_RADIUS = 1.6f
    const val HALO_STROKE = 2f
    const val DIM_ALPHA = 0.5f
    const val SHINE_ALPHA = 0.55f
    const val SPHERE_CX = 0.38f
    const val SPHERE_CY = 0.32f
    const val SPHERE_R = 0.72f
    const val SPHERE_CORE_AT = 0.28f
    const val SWIRL_A_ALPHA = 0.85f
    const val SWIRL_B_ALPHA = 0.75f
    const val SWIRL_A_X = 27f
    const val SWIRL_A_Y = 14f
    const val SWIRL_A_R = 12.4f
    const val SWIRL_B_X = 12.4f
    const val SWIRL_B_Y = 27.6f
    const val SWIRL_B_R = 11.2f
    const val SHADE_DX = 3f
    const val SHADE_DY = 5f
    const val SHADE_FROM = 0.55f
    const val SHADE_COLOUR = 0x47000000
    const val RIM_COLOUR = 0x33FFFFFF
    const val SPEC_ALPHA = 0.7f
    const val SPEC_X = 8f
    const val SPEC_Y = 6f
    const val SPEC_W = 15f
    const val SPEC_H = 9f
    const val SPEC_ROTATE = -28f
    const val STOP_ALPHA = 0.92f
    const val STOP_RADIUS = 4f
  }
}
