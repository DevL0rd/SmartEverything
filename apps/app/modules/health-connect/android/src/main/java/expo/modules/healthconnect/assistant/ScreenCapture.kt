package expo.modules.healthconnect.assistant

import android.content.Context
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Size
import android.view.WindowManager
import kotlin.math.max
import kotlin.math.min

class ScreenCapture(
  private val context: Context,
  private val projection: MediaProjection,
  private val sampling: FrameSampling,
  private val onFrame: (ByteArray) -> Unit,
  private val onStopped: () -> Unit,
  private val onFailure: (Exception) -> Unit
) : AutoCloseable {
  private val thread = HandlerThread("smarteverything-screen").apply { start() }
  private val handler = Handler(thread.looper)
  private val displays = context.getSystemService(DisplayManager::class.java)
  private val filter = FrameFilter()
  private val dpi = Resources.getSystem().displayMetrics.densityDpi
  private var size = captureSize()
  private var reader = readerOf(size)
  private var display: VirtualDisplay
  private var held: Image? = null
  private var stills = mutableListOf<(ByteArray?) -> Unit>()
  private var live = sampling.live
  private var scheduled = false
  private var sentAt = 0L
  private var closed = false
  private val resized = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) = Unit

    override fun onDisplayRemoved(displayId: Int) = Unit

    override fun onDisplayChanged(displayId: Int) = refit()
  }

  init {
    projection.registerCallback(
      object : MediaProjection.Callback() {
        override fun onStop() {
          handler.post { if (!closed) onStopped() }
        }
      },
      handler
    )
    display = mirror() ?: run {
      reader.close()
      thread.quitSafely()
      throw ProjectionRefused()
    }
    displays.registerDisplayListener(resized, handler)
  }

  private fun mirror(): VirtualDisplay? = projection.createVirtualDisplay(
    "smarteverything-call",
    size.width,
    size.height,
    dpi,
    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
    reader.surface,
    null,
    handler
  )

  fun setLive(next: Boolean) {
    handler.post {
      live = next
      filter.reset()
      if (next) schedule()
    }
  }

  fun still(timeoutMs: Long, done: (ByteArray?) -> Unit) {
    handler.post {
      guarded({ done(null) }) {
        if (held != null) {
          deliver(listOf(done))
        } else {
          stills.add(done)
          handler.postDelayed({ if (stills.remove(done)) done(null) }, timeoutMs)
        }
      }
    }
  }

  override fun close() {
    handler.post {
      if (closed) return@post
      closed = true
      displays.unregisterDisplayListener(resized)
      display.release()
      reader.close()
      held?.close()
      held = null
      projection.stop()
      thread.quitSafely()
    }
  }

  private fun readerOf(target: Size): ImageReader {
    val next = ImageReader.newInstance(target.width, target.height, PixelFormat.RGBA_8888, IMAGES)
    next.setOnImageAvailableListener(::available, handler)
    return next
  }

  private fun available(source: ImageReader) {
    val image = source.acquireLatestImage() ?: return
    held?.close()
    held = image
    val waiting = stills.toList()
    stills.clear()
    guarded({ waiting.forEach { it(null) } }) { if (waiting.isNotEmpty()) deliver(waiting) }
    if (live) schedule()
  }

  private fun deliver(waiting: List<(ByteArray?) -> Unit>) {
    val frame = held?.let(::bitmapOf) ?: return waiting.forEach { it(null) }
    val jpeg = try {
      SightFrames.encode(frame, sampling.quality, sampling.maxBytes)
    } finally {
      frame.recycle()
    }
    waiting.forEach { it(jpeg) }
  }

  private fun schedule() {
    if (scheduled || closed) return
    scheduled = true
    val wait = max(0L, sentAt + sampling.minIntervalMs - SystemClock.elapsedRealtime())
    handler.postDelayed(::emitLive, wait)
  }

  private fun emitLive() {
    scheduled = false
    guarded({}) {
      val frame = (if (live && !closed) held else null)?.let(::bitmapOf) ?: return@guarded
      sentAt = SystemClock.elapsedRealtime()
      try {
        if (filter.admits(frame, null)) onFrame(SightFrames.encode(frame, sampling.quality, sampling.maxBytes))
      } finally {
        frame.recycle()
      }
    }
  }

  private fun guarded(cleanup: () -> Unit, block: () -> Unit) {
    try {
      block()
    } catch (failure: FrameTooLarge) {
      cleanup()
      onFailure(failure)
    } catch (failure: IllegalStateException) {
      cleanup()
      onFailure(failure)
    }
  }

  private fun bitmapOf(image: Image): Bitmap {
    val plane = image.planes[0]
    val padded = Bitmap.createBitmap(plane.rowStride / plane.pixelStride, image.height, Bitmap.Config.ARGB_8888)
    padded.copyPixelsFromBuffer(plane.buffer)
    val cropped = Bitmap.createBitmap(padded, 0, 0, image.width, image.height)
    if (cropped !== padded) padded.recycle()
    return cropped
  }

  private fun refit() {
    val next = captureSize()
    if (closed || next == size) return
    val previous = reader
    size = next
    reader = readerOf(next)
    display.resize(next.width, next.height, dpi)
    display.surface = reader.surface
    previous.close()
    held?.close()
    held = null
  }

  private fun captureSize(): Size {
    val screen = fullScreen()
    val scale = min(1f, sampling.longEdge.toFloat() / max(screen.width, screen.height))
    return Size(evenOf(screen.width * scale), evenOf(screen.height * scale))
  }

  private fun fullScreen(): Size {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = context.getSystemService(WindowManager::class.java).maximumWindowMetrics.bounds
      return Size(bounds.width(), bounds.height())
    }
    val metrics = Resources.getSystem().displayMetrics
    return Size(metrics.widthPixels, metrics.heightPixels)
  }

  private fun evenOf(value: Float): Int = max(2, (value / 2).toInt() * 2)

  private companion object {
    const val IMAGES = 3
  }
}
