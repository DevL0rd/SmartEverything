package expo.modules.healthconnect.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.util.Log
import androidx.core.graphics.PathParser

enum class OverlayIcon { Mic, MicOff, End, Close, Camera, CameraOff, Speaker, StopShare, More, Less, Pause, Share, House, StopTalk, Captions, Tune, Open, Brain, BrainOff, Alert }

object OverlayFonts {
  private const val TAG = "SmartEverythingOverlay"
  private const val REGULAR = "fonts/Geist-Regular.ttf"
  private const val MEDIUM = "fonts/Geist-Medium.ttf"

  @Volatile
  private var regular: Typeface? = null

  @Volatile
  private var medium: Typeface? = null

  fun regular(context: Context): Typeface =
    regular ?: load(context, REGULAR, Typeface.DEFAULT).also { regular = it }

  fun medium(context: Context): Typeface =
    medium ?: load(context, MEDIUM, Typeface.DEFAULT_BOLD).also { medium = it }

  private fun load(context: Context, asset: String, fallback: Typeface): Typeface =
    try {
      Typeface.createFromAsset(context.assets, asset)
    } catch (failure: RuntimeException) {
      Log.e(TAG, "The overlay font $asset could not be loaded: ${failure.message}")
      fallback
    }
}

object OverlayIcons {
  private const val VIEWBOX = 24f
  private const val MIC =
    "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85" +
      "C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35" +
      " 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
  private const val END =
    "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0" +
      "-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78" +
      " 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28" +
      "-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
  private const val CLOSE =
    "M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0" +
      " 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"
  private const val CAMERA =
    "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
  private const val SPEAKER =
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
  private const val STOP = "M7 7h10v10H7z"
  private const val MORE = "M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"
  private const val LESS = "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"
  private const val PAUSE = "M6 19h4V5H6v14zm8-14v14h4V5h-4z"
  private const val SHARE =
    "M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-" +
      "2h-4zm-7-3.53v-2.19c-2.78 0-4.61.85-6 2.72.56-2.67 2.11-5.33 6-5.87V7l4 3.73-4 3.74z"
  private const val HOUSE = "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
  private const val STOP_TALK = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"
  private const val CAPTIONS =
    "M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v" +
      "3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v" +
      "-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"
  private const val TUNE =
    "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10z" +
      "m-6-4h2V7h4V5h-4V3h-2v6z"
  private const val OPEN =
    "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.8" +
      "3 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
  private const val BRAIN =
    "M13 8.57c-.79 0-1.43.64-1.43 1.43s.64 1.43 1.43 1.43 1.43-.64 1.43-1.43S13.79 8.57 13 8.57zM13 3C9.25 3 6.2 5.94" +
      " 6.01 9.64L4.1 12.2c-.25.33-.01.8.4.8H6v3c0 1.1.9 2 2 2h1v3h7v-4.68c2.36-1.12 4-3.53 4-6.32 0-3.87-3.13-7-7-7z"
  private const val ALERT = "M12 2L1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"
  private const val SLASH_CUT = 4.4f
  private const val SLASH_STROKE = 2f

  private class Glyph(val base: Path, val slash: Path?)

  private val glyphs = HashMap<OverlayIcon, Glyph>()

  private fun glyph(icon: OverlayIcon): Glyph =
    glyphs.getOrPut(icon) {
      when (icon) {
        OverlayIcon.Mic -> plain(MIC)
        OverlayIcon.End -> plain(END)
        OverlayIcon.Close -> plain(CLOSE)
        OverlayIcon.Camera -> plain(CAMERA)
        OverlayIcon.Speaker -> plain(SPEAKER)
        OverlayIcon.StopShare -> plain(STOP)
        OverlayIcon.More -> plain(MORE)
        OverlayIcon.Less -> plain(LESS)
        OverlayIcon.Pause -> plain(PAUSE)
        OverlayIcon.Share -> plain(SHARE)
        OverlayIcon.House -> plain(HOUSE)
        OverlayIcon.StopTalk -> plain(STOP_TALK)
        OverlayIcon.Captions -> plain(CAPTIONS)
        OverlayIcon.Tune -> plain(TUNE)
        OverlayIcon.Open -> plain(OPEN)
        OverlayIcon.Brain -> plain(BRAIN)
        OverlayIcon.Alert -> plain(ALERT)
        OverlayIcon.BrainOff -> struck(BRAIN, 4f, 3.5f, 20f, 20.5f)
        OverlayIcon.MicOff -> struck(MIC, 4.5f, 3.5f, 20.5f, 20.5f)
        OverlayIcon.CameraOff -> struck(CAMERA, 3f, 3.5f, 20f, 20.5f)
      }
    }

  private fun plain(data: String): Glyph = Glyph(PathParser.createPathFromPathData(data), null)

  private fun struck(data: String, fromX: Float, fromY: Float, toX: Float, toY: Float): Glyph {
    val slash = Path().apply {
      moveTo(fromX, fromY)
      lineTo(toX, toY)
    }
    val cut = Path()
    val knockout = Paint().apply {
      style = Paint.Style.STROKE
      strokeWidth = SLASH_CUT
      strokeCap = Paint.Cap.ROUND
    }
    knockout.getFillPath(slash, cut)
    val base = Path(PathParser.createPathFromPathData(data)).also { it.op(cut, Path.Op.DIFFERENCE) }
    return Glyph(base, slash)
  }

  fun draw(canvas: Canvas, icon: OverlayIcon, cx: Float, cy: Float, size: Float, paint: Paint) {
    val shape = glyph(icon)
    val scale = size / VIEWBOX
    canvas.save()
    canvas.translate(cx - size / 2f, cy - size / 2f)
    canvas.scale(scale, scale)
    val style = paint.style
    paint.style = Paint.Style.FILL
    canvas.drawPath(shape.base, paint)
    shape.slash?.let { drawSlash(canvas, it, paint) }
    paint.style = style
    canvas.restore()
  }

  private fun drawSlash(canvas: Canvas, slash: Path, paint: Paint) {
    val width = paint.strokeWidth
    val cap = paint.strokeCap
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = SLASH_STROKE
    paint.strokeCap = Paint.Cap.ROUND
    canvas.drawPath(slash, paint)
    paint.strokeWidth = width
    paint.strokeCap = cap
  }
}
