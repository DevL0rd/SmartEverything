package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

class ButtonSpec(
  val control: OverlayControl,
  val label: String,
  val icon: OverlayIcon?,
  val text: String?,
  val toggled: Boolean?,
  val critical: Boolean,
  val alert: Boolean = false,
)

class OverlayButtonView(
  context: Context,
  private val palette: OverlayPalette,
  private val onPress: (OverlayControl) -> Unit,
) : View(context) {
  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
  private val label = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val box = RectF()
  private var spec: ButtonSpec? = null

  init {
    isClickable = true
    isFocusable = true
    label.typeface = OverlayFonts.medium(context)
    label.textSize = TEXT_SIZE * density
    label.color = palette.onPrimaryContainer
    ring.color = palette.primary
    ring.strokeWidth = FOCUS_STROKE * density
    setOnClickListener { spec?.let { onPress(it.control) } }
    ViewCompat.setAccessibilityDelegate(this, ButtonDelegate())
  }

  val wantedWidth: Float
    get() {
      val text = spec?.text ?: return OverlayDims.BUTTON_TOUCH * density
      return label.measureText(text) + 2 * OverlayDims.TEXT_BUTTON_PADDING * density
    }

  val isText: Boolean
    get() = spec?.text != null

  val control: OverlayControl?
    get() = spec?.control

  fun bind(next: ButtonSpec) {
    spec = next
    contentDescription = next.label
    ViewCompat.setStateDescription(this, next.toggled?.let { if (it) STATE_ON else STATE_OFF })
    requestLayout()
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(Math.round(wantedWidth), Math.round(OverlayDims.BUTTON_TOUCH * density))
  }

  override fun drawableStateChanged() {
    super.drawableStateChanged()
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val current = spec ?: return
    if (current.text != null) drawText(canvas, current.text) else drawIcon(canvas, current)
  }

  private fun drawText(canvas: Canvas, text: String) {
    val h = OverlayDims.TEXT_BUTTON_HEIGHT * density
    val top = (height - h) / 2f
    box.set(0f, top, width.toFloat(), top + h)
    fill.color = palette.primaryContainer
    canvas.drawRoundRect(box, h / 2f, h / 2f, fill)
    val metrics = label.fontMetrics
    val base = top + (h - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
    canvas.drawText(text, (width - label.measureText(text)) / 2f, base, label)
    if (isFocused) canvas.drawRoundRect(box, h / 2f, h / 2f, ring)
  }

  private fun drawIcon(canvas: Canvas, current: ButtonSpec) {
    val radius = OverlayDims.BUTTON_VISUAL * density / 2f
    val cx = width / 2f
    val cy = height / 2f
    val background = backgroundOf(current)
    if (background != 0) {
      fill.color = background
      canvas.drawCircle(cx, cy, radius, fill)
    }
    glyph.color = glyphOf(current)
    current.icon?.let { OverlayIcons.draw(canvas, it, cx, cy, OverlayDims.ICON_DRAW * density, glyph) }
    if (isFocused) canvas.drawCircle(cx, cy, radius + FOCUS_OFFSET * density, ring)
  }

  private fun backgroundOf(current: ButtonSpec): Int =
    when {
      current.critical -> palette.critical
      current.alert -> tint(palette.critical)
      current.toggled == true -> palette.primaryContainer
      isPressed -> palette.surface3
      else -> 0
    }

  private fun glyphOf(current: ButtonSpec): Int =
    when {
      current.critical -> palette.onCritical
      current.alert -> palette.critical
      current.toggled == true -> palette.onPrimaryContainer
      else -> palette.variant
    }

  private fun tint(colour: Int): Int = (TINT_ALPHA shl ALPHA_SHIFT) or (colour and COLOUR_MASK)

  private inner class ButtonDelegate : AccessibilityDelegateCompat() {
    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfoCompat) {
      super.onInitializeAccessibilityNodeInfo(host, info)
      info.className = android.widget.Button::class.java.name
      val toggled = spec?.toggled
      info.isCheckable = toggled != null
      info.isChecked = toggled == true
    }
  }

  companion object {
    private const val TEXT_SIZE = 14f
    private const val FOCUS_STROKE = 2f
    private const val FOCUS_OFFSET = 2f
    private const val TINT_ALPHA = 0x29
    private const val ALPHA_SHIFT = 24
    private const val COLOUR_MASK = 0x00FFFFFF
    private const val STATE_ON = "On"
    private const val STATE_OFF = "Off"
  }
}
