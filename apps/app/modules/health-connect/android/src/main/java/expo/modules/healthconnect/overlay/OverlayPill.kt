package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SweepGradient
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import expo.modules.healthconnect.diagnostics.NativeLog

interface OverlayActions {
  fun onControl(control: OverlayControl)

  fun onOpen()

  fun onTile(tile: OverlayTile)

  fun onThinking(level: VoiceLevel)
}

private val SHOWN_CONTROLS = listOf(
  OverlayControl.Retry,
  OverlayControl.Fix,
  OverlayControl.Mute,
  OverlayControl.Speaker,
  OverlayControl.Camera,
  OverlayControl.StopShare,
  OverlayControl.More,
  OverlayControl.End,
  OverlayControl.Close,
)

private val RIBBON_STATES = setOf(
  OverlayState.Wake,
  OverlayState.Listening,
  OverlayState.Thinking,
  OverlayState.Speaking,
)

private val PULSE_STATES = setOf(OverlayState.Wake, OverlayState.Listening, OverlayState.Thinking)

object OverlayPillMath {
  fun textMode(view: OverlayViewState): TextMode =
    when {
      view.state == OverlayState.Error -> TextMode.Error
      view.caption == null -> TextMode.Single
      else -> TextMode.Normal
    }

  fun dim(view: OverlayViewState): Boolean =
    view.state == OverlayState.Error || view.state == OverlayState.Reconnecting

  fun ribbonShown(view: OverlayViewState): Boolean = view.state in RIBBON_STATES

  fun announcement(view: OverlayViewState): String? =
    when (view.state) {
      OverlayState.Wake -> view.status
      OverlayState.Error -> listOfNotNull(view.status, view.caption).joinToString(". ")
      OverlayState.Ended -> view.status
      else -> null
    }

  fun edgeTarget(state: OverlayState): Float =
    when (state) {
      OverlayState.Wake, OverlayState.Listening -> EDGE_LISTENING
      OverlayState.Thinking -> EDGE_THINKING
      OverlayState.Speaking -> 1f
      else -> 0f
    }

  fun edgeSpinMs(state: OverlayState): Long =
    when (state) {
      OverlayState.Speaking -> OverlayMotion.EDGE_SPIN_SPEAKING_MS
      OverlayState.Thinking -> OverlayMotion.EDGE_SPIN_THINKING_MS
      else -> OverlayMotion.EDGE_SPIN_LISTENING_MS
    }

  fun gapBefore(previous: View?, item: View): Float =
    when {
      previous == null -> OverlayDims.PILL_GAP
      previous is OverlayRibbonView -> RIBBON_TO_BUTTON
      item is OverlayThinkChip -> CHIP_GAP
      previous is OverlayButtonView && previous.isText -> TEXT_TO_BUTTON
      item is OverlayButtonView -> 0f
      else -> OverlayDims.PILL_GAP
    }

  fun dotColour(view: OverlayViewState, palette: OverlayPalette): Int =
    when (view.state) {
      OverlayState.Speaking -> palette.viz1
      OverlayState.Error -> palette.critical
      OverlayState.Reconnecting, OverlayState.Superseded, OverlayState.Ended -> palette.faint
      else -> palette.primary
    }

  const val EDGE_LISTENING = 0.85f
  const val EDGE_THINKING = 0.9f
  const val RIBBON_TO_BUTTON = 4f
  const val CHIP_GAP = 4f
  const val TEXT_TO_BUTTON = 6f
  const val QUIET_PADDING_END = 20f
  const val TEXT_COLUMN = 40f
  const val EDGE_FADE_MS = 400.0
}

class OverlayPillView(
  context: Context,
  private val palette: OverlayPalette,
  private val reduced: Boolean,
  private val actions: OverlayActions,
) : ViewGroup(context) {
  private val density = resources.displayMetrics.density
  private val orb = OverlayOrbView(context, palette, reduced)
  private val text = OverlayTextView(context, palette, reduced)
  private val ribbon = OverlayRibbonView(context, palette, reduced)
  private val buttons = LinkedHashMap<OverlayControl, OverlayButtonView>()
  private var lastWidth = 0
  private val chip = OverlayThinkChip(context, palette) { actions.onControl(OverlayControl.More) }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val spin = Matrix()
  private val box = RectF()
  private var shown: List<View> = emptyList()
  private var state = OverlayState.Hidden
  private var edgeAlpha = 0f
  private var spinMs = 0.0
  private var narrowNow = false
  private var current: OverlayViewState? = null
  private var textWidth = 0f
  private var trayOpen = false

  init {
    clipChildren = false
    clipToPadding = false
    setWillNotDraw(false)
    isClickable = true
    isFocusable = true
    setOnClickListener { actions.onOpen() }
    fill.color = palette.pill
    line.color = palette.outline
    line.strokeWidth = OverlayDims.EDGE_STROKE * density
    edge.strokeWidth = OverlayDims.EDGE_STROKE * density
    elevation = OverlayDims.ELEVATION * density
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, OverlayDims.PILL_RADIUS * density)
        outline.alpha = OverlayTokens.PILL_ALPHA / ALPHA_MAX
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      outlineAmbientShadowColor = palette.shadow
      outlineSpotShadowColor = palette.shadow
    }
    orb.setOnClickListener { actions.onControl(OverlayControl.Interrupt) }
    addView(orb)
    addView(text)
    addView(ribbon)
    addView(chip)
    chip.visibility = GONE
  }

  fun bind(view: OverlayViewState, animate: Boolean) {
    val changed = state != view.state
    state = view.state
    current = view
    orb.bind(
      view.orb,
      OverlayPillMath.dim(view),
      view.state == OverlayState.Speaking && OverlayControl.Interrupt in view.controls,
      OverlayLabels.INTERRUPT,
    )
    val content = TextContent(
      view.status,
      view.detail,
      view.caption,
      OverlayPillMath.textMode(view),
      OverlayPillMath.dotColour(view, palette),
      view.state in PULSE_STATES,
    )
    text.bind(content, animate)
    ribbon.bind(if (narrowNow) RibbonKind.Meter else RibbonKind.Ribbon, view.orb, view.muted, view.level)
    ribbon.visibility = if (OverlayPillMath.ribbonShown(view)) VISIBLE else GONE
    bindButtons(view)
    bindChip(view)
    contentDescription = listOfNotNull(view.status, view.detail, view.caption).joinToString(". ")
    if (changed) OverlayPillMath.announcement(view)?.let { announceForAccessibility(it) }
    requestLayout()
    invalidate()
  }

  fun setTrayOpen(open: Boolean) {
    if (trayOpen == open) return
    trayOpen = open
    current?.let(::bindButtons)
  }

  private fun bindButtons(view: OverlayViewState) {
    val wanted = SHOWN_CONTROLS.filter { it in view.controls }
    buttons.forEach { (control, button) -> button.visibility = if (control in wanted) VISIBLE else GONE }
    for (control in wanted) {
      val button = buttons.getOrPut(control) { newButton() }
      button.bind(specFor(control, view))
      button.visibility = VISIBLE
    }
  }

  private fun bindChip(view: OverlayViewState) {
    val data = view.chip
    if (data == null || !OverlayChipMath.shown(view)) {
      chip.visibility = GONE
      return
    }
    chip.bind(data, OverlayChipMath.iconOnly(resources.displayMetrics.widthPixels / density))
    chip.visibility = VISIBLE
  }

  private fun newButton(): OverlayButtonView =
    OverlayButtonView(context, palette) { actions.onControl(it) }.also { addView(it) }

  private fun specFor(control: OverlayControl, view: OverlayViewState): ButtonSpec =
    when (control) {
      OverlayControl.Mute ->
        ButtonSpec(control, OverlayLabels.MUTE, if (view.muted) OverlayIcon.MicOff else OverlayIcon.Mic, null, view.muted, false)
      OverlayControl.Speaker ->
        ButtonSpec(control, OverlayLabels.SPEAKER, OverlayIcon.Speaker, null, view.speaker == true, false)
      OverlayControl.Camera -> cameraSpec(view)
      OverlayControl.StopShare ->
        ButtonSpec(control, OverlayLabels.STOP_SHARE, OverlayIcon.StopShare, null, null, false, alert = true)
      OverlayControl.More ->
        ButtonSpec(control, OverlayLabels.MORE, if (trayOpen) OverlayIcon.Less else OverlayIcon.More, null, trayOpen, false)
      OverlayControl.End -> ButtonSpec(control, OverlayLabels.END, OverlayIcon.End, null, null, true)
      OverlayControl.Retry -> ButtonSpec(control, OverlayLabels.RETRY, null, OverlayLabels.RETRY, null, false)
      OverlayControl.Fix -> ButtonSpec(control, OverlayLabels.FIX, null, OverlayLabels.FIX, null, false)
      else -> ButtonSpec(control, OverlayLabels.CLOSE, OverlayIcon.Close, null, null, false)
    }

  private fun cameraSpec(view: OverlayViewState): ButtonSpec {
    val paused = view.camera == CameraPhase.Paused
    val icon = if (paused) OverlayIcon.CameraOff else OverlayIcon.Camera
    return ButtonSpec(OverlayControl.Camera, OverlayLabels.CAMERA, icon, null, !paused, false)
  }

  fun animating(): Boolean =
    orb.animating() || text.animating() || ribbon.animating() || edgeAlpha != OverlayPillMath.edgeTarget(state)

  fun advance(dtMs: Double, level: Double) {
    val step = minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    orb.advance(step, level)
    text.advance(step)
    if (ribbon.visibility == VISIBLE) ribbon.advance(step, level)
    advanceEdge(step)
  }

  private fun advanceEdge(step: Double) {
    val target = OverlayPillMath.edgeTarget(state)
    val delta = (step / OverlayPillMath.EDGE_FADE_MS).toFloat()
    edgeAlpha = if (edgeAlpha < target) minOf(target, edgeAlpha + delta) else maxOf(target, edgeAlpha - delta)
    if (!reduced && edgeAlpha > 0f) spinMs += step
    invalidate()
  }

  fun ignite() = orb.ignite()

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val available = resources.displayMetrics.widthPixels
    val narrow = OverlayWidth.narrow(available / density)
    val roomDp = (available - gutter()) / density
    if (narrow != narrowNow) {
      narrowNow = narrow
      current?.let { ribbon.bind(if (narrow) RibbonKind.Meter else RibbonKind.Ribbon, it.orb, it.muted, it.level) }
    }
    val items = rightItems()
    val fixed = fixedWidth(items)
    val view = current
    val wanted = if (view == null) 0f else text.wantedWidth(contentOf(view))
    val floor = (if (narrow) OverlayDims.TEXT_MIN_WIDTH else MIN_TEXT_WIDE) * density
    val width = OverlayWidth.pill((fixed + maxOf(wanted, floor)) / density, roomDp) * density
    shown = items
    textWidth = maxOf(0f, width - fixed)
    val measured = Math.round(width)
    if (measured != lastWidth) {
      NativeLog.debug("overlay", "pill.width_changed") {
        mapOf("from" to lastWidth, "to" to measured, "available" to available, "narrow" to narrow, "items" to items.size, "headline" to (view?.status?.length ?: 0))
      }
      lastWidth = measured
    }
    setMeasuredDimension(measured, Math.round(OverlayDims.PILL_HEIGHT * density))
    measureChildren()
  }

  private fun gutter(): Int {
    val frame = parent as? ViewGroup ?: return 0
    val margins = layoutParams as? ViewGroup.MarginLayoutParams ?: return frame.paddingLeft + frame.paddingRight
    return frame.paddingLeft + frame.paddingRight + margins.leftMargin + margins.rightMargin
  }

  private fun contentOf(view: OverlayViewState): TextContent =
    TextContent(
      view.status,
      view.detail,
      view.caption,
      OverlayPillMath.textMode(view),
      OverlayPillMath.dotColour(view, palette),
      false,
    )

  private fun rightItems(): List<View> {
    val items = ArrayList<View>()
    if (ribbon.visibility == VISIBLE) items.add(ribbon)
    val shownButtons = buttons.values.filter { it.visibility == VISIBLE }.sortedBy { SHOWN_CONTROLS.indexOf(it.control) }
    val end = shownButtons.indexOfFirst { it.control == OverlayControl.End }
    val at = if (end < 0) shownButtons.size else end
    shownButtons.forEachIndexed { index, button ->
      if (index == at && chip.visibility == VISIBLE) items.add(chip)
      items.add(button)
    }
    if (at == shownButtons.size && chip.visibility == VISIBLE) items.add(chip)
    return items
  }

  private fun fixedWidth(items: List<View>): Float {
    var total = OverlayDims.PILL_PADDING_START + OverlayDims.ORB + OverlayDims.PILL_GAP
    var previous: View? = null
    items.forEach { item ->
      total += OverlayPillMath.gapBefore(previous, item) + widthOf(item) / density
      previous = item
    }
    total += if (items.isEmpty()) OverlayPillMath.QUIET_PADDING_END else OverlayDims.PILL_PADDING_END
    return total * density
  }

  private fun widthOf(item: View): Float =
    when (item) {
      is OverlayRibbonView -> item.widthDp * density
      is OverlayButtonView -> item.wantedWidth
      is OverlayThinkChip -> item.wantedWidth
      else -> 0f
    }

  private fun measureChildren() {
    val exact = MeasureSpec.EXACTLY
    orb.measure(MeasureSpec.makeMeasureSpec(Math.round(orb.extent), exact), MeasureSpec.makeMeasureSpec(Math.round(orb.extent), exact))
    text.measure(
      MeasureSpec.makeMeasureSpec(Math.round(textWidth), exact),
      MeasureSpec.makeMeasureSpec(Math.round(OverlayPillMath.TEXT_COLUMN * density), exact),
    )
    shown.forEach { it.measure(MeasureSpec.UNSPECIFIED, MeasureSpec.UNSPECIFIED) }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val h = b - t
    var x = OverlayDims.PILL_PADDING_START * density
    val overhang = (orb.extent - OverlayDims.ORB * density) / 2f
    orb.layout(Math.round(x - overhang), (h - orb.measuredHeight) / 2, Math.round(x - overhang + orb.measuredWidth), (h + orb.measuredHeight) / 2)
    x += (OverlayDims.ORB + OverlayDims.PILL_GAP) * density
    text.layout(Math.round(x), (h - text.measuredHeight) / 2, Math.round(x + text.measuredWidth), (h + text.measuredHeight) / 2)
    x += textWidth
    var previous: View? = null
    shown.forEach { item ->
      x += OverlayPillMath.gapBefore(previous, item) * density
      item.layout(Math.round(x), (h - item.measuredHeight) / 2, Math.round(x + item.measuredWidth), (h + item.measuredHeight) / 2)
      x += item.measuredWidth
      previous = item
    }
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    val radius = OverlayDims.PILL_RADIUS * density
    box.set(0f, 0f, w, h)
    canvas.drawRoundRect(box, radius, radius, fill)
    val half = line.strokeWidth / 2f
    box.set(half, half, w - half, h - half)
    canvas.drawRoundRect(box, radius - half, radius - half, line)
    drawEdge(canvas, w, h, radius)
  }

  private fun drawEdge(canvas: Canvas, w: Float, h: Float, radius: Float) {
    if (edgeAlpha <= 0f) return
    if (edge.shader == null) edge.shader = SweepGradient(w / 2f, h / 2f, EDGE_COLOURS.map { it(palette) }.toIntArray(), EDGE_STOPS)
    val angle = (spinMs % OverlayPillMath.edgeSpinMs(state)) / OverlayPillMath.edgeSpinMs(state) * FULL_TURN
    spin.setRotate(angle.toFloat(), w / 2f, h / 2f)
    edge.shader.setLocalMatrix(spin)
    edge.alpha = Math.round(edgeAlpha * ALPHA_MAX)
    val half = edge.strokeWidth / 2f
    box.set(half, half, w - half, h - half)
    canvas.drawRoundRect(box, radius - half, radius - half, edge)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    edge.shader = null
    invalidateOutline()
  }

  companion object {
    private const val ALPHA_MAX = 255f
    private const val FULL_TURN = 360.0
    private const val MIN_TEXT_WIDE = 140f
    private val EDGE_STOPS = floatArrayOf(0f, 0.5f, 0.66f, 0.82f, 0.94f, 1f)
    private val EDGE_COLOURS = listOf<(OverlayPalette) -> Int>(
      { it.viz4 and CLEAR },
      { it.viz1 and CLEAR },
      { it.viz1 },
      { it.primary },
      { it.viz4 },
      { it.viz4 and CLEAR },
    )
    private const val CLEAR = 0x00FFFFFF
  }
}
