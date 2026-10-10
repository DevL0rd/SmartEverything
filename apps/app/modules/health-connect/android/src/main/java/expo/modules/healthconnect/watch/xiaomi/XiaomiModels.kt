package expo.modules.healthconnect.watch.xiaomi

enum class XiaomiLink { SPP, BLE, EITHER }

class XiaomiModelSpec(
  val label: String,
  pattern: String,
  val link: XiaomiLink,
  val checkTag: Boolean = true,
  val needsPhoneId: Boolean = false
) {
  private val regex = Regex(pattern, RegexOption.IGNORE_CASE)

  fun matches(name: String): Boolean = regex.matches(name.trim())
}

object XiaomiModels {
  private const val SUFFIX = " [0-9A-Z]{4}"

  val all: List<XiaomiModelSpec> = listOf(
    XiaomiModelSpec("Xiaomi Watch S5", "^Xiaomi Watch S5( .*)?$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Watch S4", "^Xiaomi Watch S4( eSIM)?$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Watch S3", "^Xiaomi Watch S3( eSIM)?$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Watch S1 Pro", "^(Xiaomi Watch S1 Pro$SUFFIX|L61.*[0-9A-F]{4})$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Watch S1", "^Xiaomi Watch S1$SUFFIX$", XiaomiLink.EITHER),
    XiaomiModelSpec("Xiaomi Watch S1 Active", "^XiaomiWatchS1Active$SUFFIX$", XiaomiLink.EITHER),
    XiaomiModelSpec("Xiaomi Watch 5", "^Xiaomi Watch 5(?! (Pro|Lite))( .*)?$", XiaomiLink.SPP, needsPhoneId = true),
    XiaomiModelSpec("Xiaomi Smart Band 10 Pro", "^Xiaomi Smart Band 10 Pro$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Smart Band 10", "^Xiaomi Smart Band 10$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Smart Band 9 Pro", "^Xiaomi Smart Band 9 Pro$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Smart Band 9 Active", "^Xiaomi( Smart)? Band 9 Active$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Xiaomi Smart Band 9", "^Xiaomi Smart Band 9$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Smart Band 8 Pro", "^Xiaomi Smart Band 8 Pro$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Xiaomi Smart Band 8 Active", "^Xiaomi( Smart)? Band 8 Active$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Xiaomi Smart Band 8", "^Xiaomi Smart Band 8$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Xiaomi Smart Band 7 Pro", "^Xiaomi Smart Band 7 Pro.*$", XiaomiLink.BLE),
    XiaomiModelSpec("Mi Smart Band 4C", "^Mi Smart Band 4C_[0-9A-F]{4}$", XiaomiLink.BLE),
    XiaomiModelSpec("Mi Watch Color Sport", "^Mi ColorS$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Mi Watch Lite", "^Mi Watch Lite_[0-9A-Z]{4}$", XiaomiLink.BLE),
    XiaomiModelSpec("Redmi Smart Band 3", "^Redmi Smart Band 3$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Redmi Smart Band 2", "^Redmi Smart Band 2$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Redmi Smart Band Pro", "^Redmi Band Pro$SUFFIX$", XiaomiLink.BLE, checkTag = false),
    XiaomiModelSpec("Redmi Watch 6", "^Redmi Watch 6( NFC)?$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Redmi Watch 5 Active", "^Redmi Watch 5 Active$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Redmi Watch 5 Lite", "^Redmi Watch 5 Lite$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Redmi Watch 5", "^Redmi Watch 5$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Redmi Watch 4", "^Redmi Watch 4$SUFFIX$", XiaomiLink.SPP),
    XiaomiModelSpec("Redmi Watch 3 Active", "^Redmi Watch 3 Active$SUFFIX$", XiaomiLink.EITHER),
    XiaomiModelSpec("Redmi Watch 3", "^Redmi Watch 3$SUFFIX$", XiaomiLink.EITHER),
    XiaomiModelSpec("Redmi Watch 2 Lite", "^Redmi Watch 2 Lite$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Redmi Watch 2", "^Redmi Watch 2$SUFFIX$", XiaomiLink.BLE),
    XiaomiModelSpec("Redmi Watch Move", "^Move$", XiaomiLink.SPP)
  )

  fun byName(name: String): XiaomiModelSpec? = all.firstOrNull { it.matches(name) }
}
