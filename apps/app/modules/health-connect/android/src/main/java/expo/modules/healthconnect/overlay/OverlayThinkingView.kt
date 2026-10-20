package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.View
import android.view.ViewGroup
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

object OverlaySegmentMath {
  fun segmentDp(): Float = OverlayDims.SEG_HEIGHT

  fun trackDp(): Float = OverlayDims.SEG_HEIGHT + 2 * OverlayDims.SEG_GAP
}

class OverlaySegmentView(
  context: Context,
  private val palette: OverlayPalette,
  val level: VoiceLevel,
  private val onPress: (VoiceLevel) -> Unit,
) : View(context) {
  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = palette.primary
  }
  private val text = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var checked = false
  private var waiting = false

  init {
    isClickable = true
    isFocusable = true
    text.typeface = OverlayFonts.medium(context)
    text.textSize = OverlayDims.SEG_LABEL_SIZE * density
    contentDescription = ThinkingCopy.name(level)
    setOnClickListener { onPress(level) }
    ViewCompat.setAccessibilityDelegate(this, SegmentDelegate())
  }

  fun bind(isChecked: Boolean, loading: Boolean) {
    checked = isChecked
    waiting = loading
    isEnabled = !loading
    alpha = if (loading) LOADING_ALPHA else 1f
    invalidate()
  }

  override fun drawableStateChanged() {
    super.drawableStateChanged()
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val radius = OverlayDims.SEG_RADIUS * density - SEG_INSET * density
    box.set(0f, 0f, width.toFloat(), height.toFloat())
    val color = when {
      checked -> palette.primaryContainer
      isPressed -> palette.surface3
      else -> 0
    }
    if (color != 0) {
      fill.color = color
      canvas.drawRoundRect(box, radius, radius, fill)
    }
    if (checked) {
      val half = OverlayDims.EDGE_STROKE * density / 2f
      ring.strokeWidth = half * 2f
      box.inset(half, half)
      canvas.drawRoundRect(box, radius, radius, ring)
    }
    text.color = if (checked) palette.onPrimaryContainer else palette.variant
    val label = ThinkingCopy.name(level)
    val metrics = text.fontMetrics
    val base = (height - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
    canvas.drawText(label, (width - text.measureText(label)) / 2f, base, text)
  }

  private inner class SegmentDelegate : AccessibilityDelegateCompat() {
    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfoCompat) {
      super.onInitializeAccessibilityNodeInfo(host, info)
      info.className = android.widget.RadioButton::class.java.name
      info.isCheckable = true
      info.isChecked = checked
    }
  }

  private companion object {
    const val LOADING_ALPHA = 0.42f
    const val SEG_INSET = 2f
  }
}

class OverlayThinkingView(
  context: Context,
  private val palette: OverlayPalette,
  private val onPick: (VoiceLevel) -> Unit,
) : ViewGroup(context) {
  private val density = resources.displayMetrics.density
  private val segments = ThinkingCopy.LEVELS.map { OverlaySegmentView(context, palette, it, onPick) }
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.outline }
  private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.surface2 }
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
  private val name = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val save = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val note = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var setup = OverlaySetup(null, SetupState.Loading, ThinkingCopy.LOADING)
  private var noteLayout: StaticLayout? = null

  init {
    setWillNotDraw(false)
    name.typeface = OverlayFonts.regular(context)
    name.textSize = OverlayDims.THINK_NAME_SIZE * density
    name.color = palette.onSurface
    save.typeface = OverlayFonts.medium(context)
    save.textSize = OverlayDims.THINK_SAVE_SIZE * density
    save.color = palette.primary
    note.typeface = OverlayFonts.regular(context)
    note.textSize = OverlayDims.THINK_NOTE_SIZE * density
    glyph.color = palette.variant
    segments.forEach { addView(it) }
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = ThinkingCopy.GROUP
    ViewCompat.setAccessibilityDelegate(this, GroupDelegate())
    accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
  }

  fun bind(next: OverlaySetup) {
    setup = next
    segments.forEach { it.bind(it.level == next.level, next.state == SetupState.Loading) }
    requestLayout()
    invalidate()
  }

  private fun noteWidth(width: Int): Int =
    width - if (setup.state == SetupState.Failed) Math.round((OverlayDims.CHIP_ICON + OverlayDims.CHIP_GAP) * density) else 0

  private fun layoutOf(width: Int): StaticLayout {
    note.color = if (setup.state == SetupState.Failed) palette.critical else palette.variant
    return StaticLayout.Builder.obtain(setup.note, 0, setup.note.length, note, noteWidth(width))
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setMaxLines(NOTE_LINES)
      .setEllipsize(android.text.TextUtils.TruncateAt.END)
      .build()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val notes = layoutOf(width)
    noteLayout = notes
    val gap = Math.round(OverlayDims.SEG_GAP * density)
    val part = (width - 2 * gap - 3 * gap) / segments.size
    val seg = Math.round(OverlaySegmentMath.segmentDp() * density)
    segments.forEach {
      it.measure(MeasureSpec.makeMeasureSpec(part, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(seg, MeasureSpec.EXACTLY))
    }
    val height = (OverlayDims.THINK_PAD_TOP + OverlayDims.THINK_HEAD + 2 * OverlayDims.THINK_GAP + OverlaySegmentMath.trackDp()) * density + notes.height
    setMeasuredDimension(width, Math.round(height))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val gap = Math.round(OverlayDims.SEG_GAP * density)
    val top = trackTop() + gap
    var x = gap
    segments.forEach {
      it.layout(x, top, x + it.measuredWidth, top + it.measuredHeight)
      x += it.measuredWidth + gap
    }
  }

  private fun trackTop(): Int = Math.round((OverlayDims.THINK_PAD_TOP + OverlayDims.THINK_HEAD + OverlayDims.THINK_GAP) * density)

  override fun onDraw(canvas: Canvas) {
    line.strokeWidth = OverlayDims.EDGE_STROKE * density
    canvas.drawRect(0f, 0f, width.toFloat(), line.strokeWidth, line)
    drawHead(canvas)
    val seg = OverlaySegmentMath.trackDp() * density
    val top = trackTop().toFloat()
    box.set(0f, top, width.toFloat(), top + seg)
    val radius = OverlayDims.SEG_RADIUS * density
    canvas.drawRoundRect(box, radius, radius, track)
    drawNote(canvas, top + seg + OverlayDims.THINK_GAP * density)
  }

  private fun drawHead(canvas: Canvas) {
    val mid = (OverlayDims.THINK_PAD_TOP + OverlayDims.THINK_HEAD / 2f) * density
    val icon = OverlayDims.THINK_ICON * density
    OverlayIcons.draw(canvas, OverlayIcon.Brain, 4f * density + icon / 2f, mid, icon, glyph)
    val x = 4f * density + icon + 10f * density
    val base = mid - (name.descent() + name.ascent()) / 2f
    canvas.drawText(ThinkingCopy.SECTION, x, base, name)
    if (setup.state != SetupState.Saving) return
    val after = x + name.measureText(ThinkingCopy.SECTION) + 10f * density
    canvas.drawText(ThinkingCopy.SAVING, after, mid - (save.descent() + save.ascent()) / 2f, save)
  }

  private fun drawNote(canvas: Canvas, top: Float) {
    val notes = noteLayout ?: return
    var x = 0f
    if (setup.state == SetupState.Failed) {
      val icon = OverlayDims.CHIP_ICON * density
      glyph.color = palette.critical
      OverlayIcons.draw(canvas, OverlayIcon.Alert, icon / 2f, top + OverlayDims.THINK_NOTE_LINE * density / 2f, icon, glyph)
      glyph.color = palette.variant
      x = icon + OverlayDims.CHIP_GAP * density
    }
    canvas.save()
    canvas.translate(x, top)
    notes.draw(canvas)
    canvas.restore()
  }

  private inner class GroupDelegate : AccessibilityDelegateCompat() {
    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfoCompat) {
      super.onInitializeAccessibilityNodeInfo(host, info)
      info.className = android.widget.RadioGroup::class.java.name
      info.stateDescription = setup.note
    }
  }

  private companion object {
    const val NOTE_LINES = 2
  }
}
