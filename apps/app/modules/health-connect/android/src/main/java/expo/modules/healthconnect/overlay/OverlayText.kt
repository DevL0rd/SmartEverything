package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import android.view.View

enum class TextMode { Normal, Single, Error }

class TextContent(
  val status: String,
  val detail: String?,
  val caption: String?,
  val mode: TextMode,
  val dot: Int,
  val pulse: Boolean,
) {
  val headline: String
    get() = if (detail == null) status else "$status$DETAIL_SEPARATOR$detail"

  fun sameFace(other: TextContent?): Boolean =
    other != null && other.headline == headline && other.mode == mode && other.dot == dot

  companion object {
    const val DETAIL_SEPARATOR = " · "
  }
}

private class Drawn(
  val headline: String,
  val caption: CaptionLine?,
  val captionX: Float,
  val mode: TextMode,
  val dot: Int,
)

class OverlayTextView(context: Context, private val palette: OverlayPalette, private val reduced: Boolean) :
  View(context) {
  private val density = resources.displayMetrics.density
  private val small = paint(OverlayFonts.medium(context), OverlayDims.STATUS_SIZE, palette.variant)
  private val head = paint(OverlayFonts.medium(context), OverlayDims.CAPTION_SIZE, palette.onSurface)
  private val body = paint(OverlayFonts.regular(context), OverlayDims.CAPTION_SIZE, palette.onSurface)
  private val reason = paint(OverlayFonts.regular(context), OverlayDims.STATUS_SIZE, palette.variant)
  private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val fadePaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
  private val lineBox = RectF()
  private var content: TextContent? = null
  private var current: Drawn? = null
  private var previous: Drawn? = null
  private var swap = 0.0
  private var pulse = 0.0

  init {
    small.letterSpacing = LETTER_SPACING / OverlayDims.STATUS_SIZE
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  fun wantedWidth(content: TextContent): Float {
    val face = faceFor(content)
    val dot = (OverlayDims.STATUS_DOT + OverlayDims.STATUS_DOT_GAP) * density
    val caption = content.caption?.let { captionPaint(content).measureText(it) } ?: 0f
    return maxOf(dot + face.measureText(content.headline), caption)
  }

  fun bind(next: TextContent, animate: Boolean) {
    val old = content
    content = next
    if (animate && !reduced && old != null && !next.sameFace(old)) {
      previous = current
      swap = 0.0
    } else {
      previous = null
    }
    current = build(next)
    invalidate()
  }

  fun animating(): Boolean = previous != null || (content?.pulse == true && !reduced)

  fun advance(dtMs: Double) {
    if (previous != null) {
      swap += minOf(dtMs, OverlayMotion.MAX_STEP_MS)
      if (swap >= OverlayMotion.SWAP_MS) previous = null
    }
    if (content?.pulse == true && !reduced) pulse += minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    content?.let { current = build(it) }
    val from = OverlayDims.CAPTION_FADE_START * density
    val to = from + OverlayDims.CAPTION_FADE * density
    fadePaint.shader = LinearGradient(from, 0f, to, 0f, CLEAR, OPAQUE, Shader.TileMode.CLAMP)
  }

  override fun onDraw(canvas: Canvas) {
    val now = current ?: return
    val slide = OverlayMotion.SWAP_SLIDE_DP * density
    val t = if (previous == null) 1f else (swap / OverlayMotion.SWAP_MS).toFloat().coerceIn(0f, 1f)
    previous?.let { draw(canvas, it, 1f - t, -slide * t) }
    draw(canvas, now, t, slide * (1f - t))
  }

  private fun draw(canvas: Canvas, drawn: Drawn, alpha: Float, offset: Float) {
    if (alpha <= 0f) return
    canvas.save()
    canvas.translate(0f, offset)
    when (drawn.mode) {
      TextMode.Single -> drawSingle(canvas, drawn, alpha)
      TextMode.Normal, TextMode.Error -> drawStacked(canvas, drawn, alpha)
    }
    canvas.restore()
  }

  private fun drawSingle(canvas: Canvas, drawn: Drawn, alpha: Float) {
    val line = OverlayDims.CAPTION_LINE * density
    val base = baseline(head, (height - line) / 2f, line)
    drawLine(canvas, drawn, head, base, alpha)
  }

  private fun drawStacked(canvas: Canvas, drawn: Drawn, alpha: Float) {
    val error = drawn.mode == TextMode.Error
    val first = (if (error) OverlayDims.CAPTION_LINE else OverlayDims.STATUS_LINE) * density
    val second = (if (error) OverlayDims.STATUS_LINE else OverlayDims.CAPTION_LINE) * density
    val top = (height - first - second) / 2f
    val paintOne = if (error) head else small
    drawLine(canvas, drawn, paintOne, baseline(paintOne, top, first), alpha)
    val caption = drawn.caption ?: return
    val paintTwo = if (error) reason else body
    drawCaption(canvas, caption, drawn.captionX, paintTwo, top + first, second, alpha)
  }

  private fun drawCaption(canvas: Canvas, caption: CaptionLine, x: Float, paint: Paint, top: Float, line: Float, alpha: Float) {
    lineBox.set(0f, top, width.toFloat(), top + line)
    val layer = canvas.saveLayer(lineBox, null)
    paint.alpha = scaled(alpha)
    canvas.drawText(caption.text, x, baseline(paint, top, line), paint)
    paint.alpha = FULL
    if (caption.trimmed) canvas.drawRect(lineBox, fadePaint)
    canvas.restoreToCount(layer)
  }

  private fun drawLine(canvas: Canvas, drawn: Drawn, paint: Paint, baseline: Float, alpha: Float) {
    val dot = OverlayDims.STATUS_DOT * density
    val gap = OverlayDims.STATUS_DOT_GAP * density
    val breathe = if (content?.pulse == true && !reduced) breathing() else 1f
    dotPaint.color = drawn.dot
    dotPaint.alpha = scaled(alpha * breathe * DOT_GLOW)
    val cy = baseline - (paint.textSize * DOT_RISE)
    canvas.drawCircle(dot / 2f, cy, dot, dotPaint)
    dotPaint.alpha = scaled(alpha * breathe)
    canvas.drawCircle(dot / 2f, cy, dot / 2f, dotPaint)
    paint.alpha = scaled(alpha)
    canvas.drawText(drawn.headline, dot + gap, baseline, paint)
    paint.alpha = FULL
  }

  private fun breathing(): Float {
    val cycle = pulse % (2.0 * DOT_MS) / DOT_MS
    val u = (if (cycle > 1.0) 2.0 - cycle else cycle).toFloat()
    return BREATHE_FROM + (BREATHE_TO - BREATHE_FROM) * GlowMath.ease(u)
  }

  private fun build(next: TextContent): Drawn {
    val room = width.toFloat()
    val dot = (OverlayDims.STATUS_DOT + OverlayDims.STATUS_DOT_GAP) * density
    val face = faceFor(next)
    val headline = TextUtils.ellipsize(next.headline, face, maxOf(0f, room - dot), TextUtils.TruncateAt.END).toString()
    val paint = captionPaint(next)
    val line = next.caption?.let { CaptionFit.tail(it, room) { text -> paint.measureText(text, 0, text.length) } }
    val x = if (line != null && line.trimmed) room - line.width else 0f
    return Drawn(headline, line, x, next.mode, next.dot)
  }

  private fun faceFor(next: TextContent): TextPaint = if (next.mode == TextMode.Normal) small else head

  private fun captionPaint(next: TextContent): TextPaint = if (next.mode == TextMode.Error) reason else body

  private fun baseline(paint: Paint, top: Float, line: Float): Float {
    val metrics = paint.fontMetrics
    return top + (line - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
  }

  private fun scaled(alpha: Float): Int = Math.round(alpha.coerceIn(0f, 1f) * FULL)

  private fun paint(face: Typeface, size: Float, colour: Int): TextPaint =
    TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = face
      textSize = size * density
      color = colour
    }

  companion object {
    private const val FULL = 255
    private const val LETTER_SPACING = 0.2f
    private const val CLEAR = 0x00000000
    private const val OPAQUE = 0xFF000000.toInt()
    private const val DOT_RISE = 0.34f
    private const val DOT_GLOW = 0.25f
    private const val DOT_MS = 1100.0
    private const val BREATHE_FROM = 0.45f
    private const val BREATHE_TO = 0.95f
  }
}
