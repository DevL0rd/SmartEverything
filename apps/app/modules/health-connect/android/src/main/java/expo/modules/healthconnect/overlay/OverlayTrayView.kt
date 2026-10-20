package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.TextPaint
import android.text.TextUtils
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

class OverlayTileView(context: Context, private val palette: OverlayPalette, private val onPress: (OverlayTile) -> Unit) :
  View(context) {
  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG)
  private val text = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var tile: OverlayTile? = null

  init {
    isClickable = true
    isFocusable = true
    text.typeface = OverlayFonts.medium(context)
    text.textSize = OverlayDims.TILE_LABEL_SIZE * density
    setOnClickListener { tile?.let(onPress) }
    ViewCompat.setAccessibilityDelegate(this, TileDelegate())
  }

  fun bind(next: OverlayTile) {
    tile = next
    isEnabled = next.disabled == null
    contentDescription = OverlayTrayModel.describe(next)
    alpha = if (isEnabled) 1f else DISABLED_ALPHA
    invalidate()
  }

  override fun drawableStateChanged() {
    super.drawableStateChanged()
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val current = tile ?: return
    val radius = OverlayDims.TILE_RADIUS * density
    box.set(0f, 0f, width.toFloat(), height.toFloat())
    fill.color = backgroundOf(current)
    canvas.drawRoundRect(box, radius, radius, fill)
    val ink = inkOf(current)
    glyph.color = ink
    text.color = ink
    val icon = OverlayDims.TILE_ICON * density
    val line = text.fontMetrics.let { it.descent - it.ascent }
    val block = icon + OverlayDims.TILE_LABEL_GAP * density + line
    val top = (height - block) / 2f
    OverlayIcons.draw(canvas, OverlayTrayModel.iconOf(current), width / 2f, top + icon / 2f, icon, glyph)
    val room = width - 2 * LABEL_PAD * density
    val label = TextUtils.ellipsize(current.label, text, room, TextUtils.TruncateAt.END).toString()
    canvas.drawText(label, (width - text.measureText(label)) / 2f, top + icon + OverlayDims.TILE_LABEL_GAP * density - text.fontMetrics.ascent, text)
  }

  private fun backgroundOf(current: OverlayTile): Int =
    when {
      current.critical -> tint(palette.critical)
      current.pressed == true -> palette.primaryContainer
      isPressed -> palette.surface3
      else -> palette.surface2
    }

  private fun inkOf(current: OverlayTile): Int =
    when {
      current.critical -> palette.critical
      current.pressed == true -> palette.onPrimaryContainer
      else -> palette.onSurface
    }

  private fun tint(colour: Int): Int = (TINT_ALPHA shl ALPHA_SHIFT) or (colour and COLOUR_MASK)

  private inner class TileDelegate : AccessibilityDelegateCompat() {
    override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfoCompat) {
      super.onInitializeAccessibilityNodeInfo(host, info)
      info.className = android.widget.Button::class.java.name
      val pressed = tile?.pressed
      info.isCheckable = pressed != null
      info.isChecked = pressed == true
    }
  }

  private companion object {
    const val LABEL_PAD = 4f
    const val DISABLED_ALPHA = 0.42f
    const val TINT_ALPHA = 0x29
    const val ALPHA_SHIFT = 24
    const val COLOUR_MASK = 0x00FFFFFF
  }
}

class OverlayOpenChip(context: Context, private val palette: OverlayPalette, onPress: () -> Unit) : View(context) {
  private val density = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.primaryContainer }
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.onPrimaryContainer }
  private val text = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()

  init {
    isClickable = true
    isFocusable = true
    contentDescription = OverlayTrayModel.OPEN_CALL
    text.typeface = OverlayFonts.medium(context)
    text.textSize = LABEL_SIZE * density
    text.color = palette.onPrimaryContainer
    setOnClickListener { onPress() }
  }

  val wantedWidth: Float
    get() = (2 * OverlayDims.TRAY_CHIP_PADDING + OverlayDims.TRAY_CHIP_ICON + ICON_GAP) * density + text.measureText(OverlayTrayModel.OPEN_CALL)

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(Math.round(wantedWidth), Math.round(OverlayDims.TRAY_HEAD * density))
  }

  override fun onDraw(canvas: Canvas) {
    val h = OverlayDims.TRAY_CHIP_HEIGHT * density
    val top = (height - h) / 2f
    box.set(0f, top, width.toFloat(), top + h)
    if (isPressed) fill.alpha = PRESSED_ALPHA else fill.alpha = FULL
    canvas.drawRoundRect(box, h / 2f, h / 2f, fill)
    val icon = OverlayDims.TRAY_CHIP_ICON * density
    val x = OverlayDims.TRAY_CHIP_PADDING * density
    OverlayIcons.draw(canvas, OverlayIcon.Open, x + icon / 2f, height / 2f, icon, glyph)
    val metrics = text.fontMetrics
    val base = top + (h - (metrics.descent - metrics.ascent)) / 2f - metrics.ascent
    canvas.drawText(OverlayTrayModel.OPEN_CALL, x + icon + ICON_GAP * density, base, text)
  }

  private companion object {
    const val LABEL_SIZE = 13f
    const val ICON_GAP = 6f
    const val PRESSED_ALPHA = 200
    const val FULL = 255
  }
}

class OverlayTrayView(
  context: Context,
  private val palette: OverlayPalette,
  private val onTile: (OverlayTile) -> Unit,
  onThinking: (VoiceLevel) -> Unit,
  onOpen: () -> Unit,
) : ViewGroup(context) {
  private val density = resources.displayMetrics.density
  private val tiles = ArrayList<OverlayTileView>()
  private val open = OverlayOpenChip(context, palette, onOpen)
  private val thinking = OverlayThinkingView(context, palette, onThinking)
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.pill }
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = palette.outline
    strokeWidth = OverlayDims.EDGE_STROKE * density
  }
  private val name = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val sub = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val box = RectF()
  private var title = ""
  private var subtitle = ""
  private var shown = 0

  init {
    clipChildren = false
    setWillNotDraw(false)
    name.typeface = OverlayFonts.medium(context)
    name.textSize = OverlayDims.TRAY_NAME_SIZE * density
    name.color = palette.onSurface
    sub.typeface = OverlayFonts.regular(context)
    sub.textSize = OverlayDims.STATUS_SIZE * density
    sub.color = palette.variant
    elevation = OverlayDims.ELEVATION * density
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, OverlayDims.TRAY_RADIUS * density)
        outline.alpha = OverlayTokens.PILL_ALPHA / ALPHA_MAX
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      outlineAmbientShadowColor = palette.shadow
      outlineSpotShadowColor = palette.shadow
    }
    isClickable = true
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = OverlayTrayModel.DESCRIPTION
    addView(open)
    addView(thinking)
  }

  fun bind(tray: OverlayTray, now: Long) {
    title = tray.assistant
    subtitle = OverlayTrayModel.subtitle(tray, now)
    while (tiles.size < tray.tiles.size) tiles.add(OverlayTileView(context, palette, onTile).also { addView(it) })
    tiles.forEachIndexed { index, view ->
      val next = tray.tiles.getOrNull(index)
      view.visibility = if (next == null) GONE else VISIBLE
      next?.let(view::bind)
    }
    shown = tray.tiles.size
    thinking.bind(tray.setup)
    requestLayout()
    invalidate()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val pad = OverlayDims.TRAY_PADDING * density
    val rows = OverlayTrayModel.rows(shown)
    val gap = OverlayDims.TILE_GAP * density
    val tileHeight = OverlayDims.TILE_HEIGHT * density
    val grid = if (rows == 0) 0f else rows * tileHeight + (rows - 1) * gap
    open.measure(MeasureSpec.UNSPECIFIED, MeasureSpec.UNSPECIFIED)
    thinking.measure(
      MeasureSpec.makeMeasureSpec(Math.round(width - 2 * pad), MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
    )
    val height = pad + OverlayDims.TRAY_HEAD * density + grid + gap + thinking.measuredHeight + pad
    val tileWidth = Math.round(OverlayTrayModel.tileWidth(width - 2 * pad, gap))
    tiles.filter { it.visibility == VISIBLE }.forEach {
      it.measure(
        MeasureSpec.makeMeasureSpec(tileWidth, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(Math.round(tileHeight), MeasureSpec.EXACTLY),
      )
    }
    setMeasuredDimension(width, Math.round(height))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val pad = OverlayDims.TRAY_PADDING * density
    val gap = OverlayDims.TILE_GAP * density
    val headTop = pad
    val chipRight = (r - l) - pad
    open.layout(Math.round(chipRight - open.measuredWidth), Math.round(headTop), Math.round(chipRight), Math.round(headTop + open.measuredHeight))
    val gridTop = headTop + OverlayDims.TRAY_HEAD * density
    tiles.filter { it.visibility == VISIBLE }.forEachIndexed { index, view ->
      val column = index % OverlayTrayModel.COLUMNS
      val row = index / OverlayTrayModel.COLUMNS
      val x = pad + column * (view.measuredWidth + gap)
      val y = gridTop + row * (view.measuredHeight + gap)
      view.layout(Math.round(x), Math.round(y), Math.round(x) + view.measuredWidth, Math.round(y) + view.measuredHeight)
    }
    val rows = OverlayTrayModel.rows(shown)
    val grid = if (rows == 0) 0f else rows * OverlayDims.TILE_HEIGHT * density + (rows - 1) * gap
    val thinkTop = Math.round(gridTop + grid + gap)
    thinking.layout(Math.round(pad), thinkTop, Math.round(pad) + thinking.measuredWidth, thinkTop + thinking.measuredHeight)
  }

  override fun onDraw(canvas: Canvas) {
    val radius = OverlayDims.TRAY_RADIUS * density
    box.set(0f, 0f, width.toFloat(), height.toFloat())
    canvas.drawRoundRect(box, radius, radius, fill)
    val half = line.strokeWidth / 2f
    box.set(half, half, width - half, height - half)
    canvas.drawRoundRect(box, radius - half, radius - half, line)
    drawHead(canvas)
  }

  private fun room(): Float = open.left - 2 * OverlayDims.TRAY_PADDING * density - HEAD_PAD_START * density

  private fun drawHead(canvas: Canvas) {
    val lines = (OverlayDims.TRAY_NAME_LINE + OverlayDims.TRAY_SUB_LINE) * density
    val top = OverlayDims.TRAY_PADDING * density + (OverlayDims.TRAY_HEAD * density - lines) / 2f
    drawLine(canvas, title, name, OverlayDims.TRAY_NAME_LINE * density, top)
    drawLine(canvas, subtitle, sub, OverlayDims.TRAY_SUB_LINE * density, top + OverlayDims.TRAY_NAME_LINE * density)
  }

  private fun drawLine(canvas: Canvas, value: String, paint: TextPaint, height: Float, top: Float) {
    if (value.isEmpty()) return
    val x = (OverlayDims.TRAY_PADDING + HEAD_PAD_START) * density
    val base = top + (height - (paint.descent() - paint.ascent())) / 2f - paint.ascent()
    canvas.drawText(TextUtils.ellipsize(value, paint, room(), TextUtils.TruncateAt.END).toString(), x, base, paint)
  }

  private companion object {
    const val ALPHA_MAX = 255f
    const val HEAD_PAD_START = 4f
  }
}
