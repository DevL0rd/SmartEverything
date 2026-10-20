package expo.modules.healthconnect.toothbrush

object BrushText {
  fun busy(brand: String): String = when (brand) {
    "oralb" -> "Another app or the charger may be holding the brush. Close the Oral-B app and lift the brush again."
    else -> "Another app, probably the Philips Sonicare app, may be using the brush. Close it and lift the brush again."
  }
}
