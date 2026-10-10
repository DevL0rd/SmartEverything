package expo.modules.healthconnect.assistant

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.media.ExifInterface
import android.os.SystemClock
import java.io.ByteArrayOutputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class FrameUnreadable(path: String) : Exception("The picture at $path could not be read")

class FrameTooLarge(bytes: Int, limit: Int) :
  Exception("The picture is $bytes bytes even at the lowest quality; the home server accepts $limit")

object SightFrames {
  private const val SIGHT_FRAME: Byte = 0x02
  private const val STILL_FLAG: Byte = 0x01
  private const val QUALITY_STEP = 15
  private const val QUALITY_FLOOR = 25
  private const val PERCENT = 100

  fun wrap(sourceCode: Int, still: Boolean, jpeg: ByteArray): ByteArray =
    byteArrayOf(SIGHT_FRAME, sourceCode.toByte(), if (still) STILL_FLAG else 0) + jpeg

  fun decode(path: String, longEdge: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw FrameUnreadable(path)
    val options = BitmapFactory.Options().apply { inSampleSize = sampleOf(max(bounds.outWidth, bounds.outHeight), longEdge) }
    val raw = BitmapFactory.decodeFile(path, options) ?: throw FrameUnreadable(path)
    val matrix = Matrix().apply {
      postRotate(rotationOf(path))
      val scale = min(1f, longEdge.toFloat() / max(raw.width, raw.height))
      postScale(scale, scale)
    }
    val fitted = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
    if (fitted !== raw) raw.recycle()
    return fitted
  }

  fun encode(bitmap: Bitmap, quality: Double, maxBytes: Int): ByteArray {
    var percent = (quality * PERCENT).toInt()
    while (true) {
      val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, percent, it) }.toByteArray()
      if (bytes.size <= maxBytes) return bytes
      if (percent <= QUALITY_FLOOR) throw FrameTooLarge(bytes.size, maxBytes)
      percent = max(QUALITY_FLOOR, percent - QUALITY_STEP)
    }
  }

  private fun sampleOf(longest: Int, wanted: Int): Int {
    var sample = 1
    while (longest / (sample * 2) >= wanted) sample *= 2
    return sample
  }

  private fun rotationOf(path: String): Float =
    when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
}

class FrameFilter(private val threshold: Double = DEFAULT_THRESHOLD) {
  private var sent: IntArray? = null
  private var sentAt = 0L

  @Synchronized
  fun reset() {
    sent = null
    sentAt = 0L
  }

  @Synchronized
  fun admits(bitmap: Bitmap, refreshMs: Long?): Boolean {
    val tiny = Bitmap.createScaledBitmap(bitmap, SIDE, SIDE, true)
    val pixels = IntArray(SIDE * SIDE)
    tiny.getPixels(pixels, 0, SIDE, 0, 0, SIDE, SIDE)
    tiny.recycle()
    val luminance = IntArray(pixels.size) { lumaOf(pixels[it]) }
    val now = SystemClock.elapsedRealtime()
    val before = sent
    val changed = before == null || differenceOf(before, luminance) >= threshold
    val stale = refreshMs != null && now - sentAt >= refreshMs
    if (changed || stale) {
      sent = luminance
      sentAt = now
    }
    return changed || stale
  }

  private fun lumaOf(pixel: Int): Int = (Color.red(pixel) * RED + Color.green(pixel) * GREEN + Color.blue(pixel) * BLUE) / WEIGHTS

  private fun differenceOf(a: IntArray, b: IntArray): Double {
    var total = 0L
    for (index in a.indices) total += abs(a[index] - b[index])
    return total.toDouble() / a.size / FULL_SCALE
  }

  private companion object {
    const val DEFAULT_THRESHOLD = 0.02
    const val SIDE = 24
    const val RED = 299
    const val GREEN = 587
    const val BLUE = 114
    const val WEIGHTS = 1000
    const val FULL_SCALE = 255.0
  }
}
