package expo.modules.healthconnect.overlay

import java.text.BreakIterator

class CaptionLine(val text: String, val width: Float, val trimmed: Boolean)

object CaptionFit {
  fun tail(text: String, room: Float, measure: (CharSequence) -> Float): CaptionLine {
    val whole = measure(text)
    if (whole <= room) return CaptionLine(text, whole, false)
    if (room <= 0f || text.isEmpty()) return CaptionLine("", 0f, true)
    val starts = boundaries(text)
    var low = 0
    var high = starts.size - 1
    while (low < high) {
      val mid = (low + high) / 2
      if (measure(text.substring(starts[mid])) <= room) high = mid else low = mid + 1
    }
    val kept = text.substring(starts[low])
    return CaptionLine(kept, measure(kept), true)
  }

  private fun boundaries(text: String): IntArray {
    val iterator = BreakIterator.getCharacterInstance()
    iterator.setText(text)
    val starts = ArrayList<Int>()
    var at = iterator.first()
    while (at != BreakIterator.DONE && at < text.length) {
      starts.add(at)
      at = iterator.next()
    }
    starts.add(text.length)
    return starts.toIntArray()
  }
}
