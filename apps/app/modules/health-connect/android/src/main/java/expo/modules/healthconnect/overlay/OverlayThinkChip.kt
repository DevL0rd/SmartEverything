package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.TextPaint
import android.view.View

object OverlayChipMath {
  fun iconOnly(screenDp: Float): Boolean = screenDp < OverlayDims.CHIP_ICON_ONLY_BELOW

  fun icon(level: VoiceLevel): OverlayIcon = if (level == VoiceLevel.Off) OverlayIcon.BrainOff else OverlayIcon.Brain

  fun shown(view: OverlayViewState): Boolean = view.chip != null && view.mode == OverlayMode.Compact

  fun labelledDp(labelDp: Float): Float = 2 * OverlayDims.CHIP_PADDING + OverlayDims.CHIP_ICON + OverlayDims.CHIP_GAP + labelDp
}

class OverlayThinkChip(context: Context, private val palette: OverlayPalette, private val onPress: () -> Unit) : View(context) {
  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
  private val text = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var chip: OverlayChip? = null
  private var compact = false

  init {
    isClickable = true
    isFocusable = true
    text.typeface = OverlayFonts.medium(context)
    text.textSize = OverlayDims.CHIP_LABEL_SIZE * density
    setOnClickListener { onPress() }
  }

  fun bind(next: OverlayChip, iconOnly: Boolean) {
    chip = next
    compact = iconOnly
    contentDescription = next.description
    requestLayout()
    invalidate()
  }

  val wantedWidth: Float
    get() {
      val current = chip ?: return 0f
      if (compact) return maxOf(OverlayDims.CHIP_TOUCH, OverlayDims.CHIP_ICON + 2 * OverlayDims.CHIP_PADDING) * density
      return OverlayChipMath.labelledDp(text.measureText(current.label) / density) * density
    }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(Math.round(wantedWidth), Math.round(OverlayDims.CHIP_TOUCH * density))
  }

  override fun drawableStateChanged() {
    super.drawableStateChanged()
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val current = chip ?: return
    val h = OverlayDims.CHIP_HEIGHT * density
    val top = (height - h) / 2f
    val w = if (compact) h else width.toFloat()
    val left = (width - w) / 2f
    box.set(left, top, left + w, top + h)
    fill.color = when {
      current.warm -> palette.primaryContainer
      isPressed -> palette.surface3
      else -> palette.surface2
    }
    canvas.drawRoundRect(box, h / 2f, h / 2f, fill)
    val ink = if (current.warm) palette.onPrimaryContainer else palette.variant
    glyph.color = ink
    text.color = ink
    val icon = OverlayDims.CHIP_ICON * density
    val pad = OverlayDims.CHIP_PADDING * density
    val iconX = if (compact) left + w / 2f else left + pad + icon / 2f
    OverlayIcons.draw(canvas, OverlayChipMath.icon(current.level), iconX, height / 2f, icon, glyph)
    if (compact) return
    val metrics = text.fontMetrics
    val base = top + (h - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
    canvas.drawText(current.label, left + pad + icon + OverlayDims.CHIP_GAP * density, base, text)
  }
}
