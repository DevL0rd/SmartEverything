package expo.modules.healthconnect.watch.xiaomi

class SportList(val codes: List<Int>, val source: String)

object XiaomiSports {
  private val CODES: Map<String, Int> = mapOf(
    "outdoor_running" to 1,
    "walking" to 2,
    "treadmill" to TREADMILL_SPORT_CODE,
    "outdoor_cycling" to 6,
    "indoor_cycling" to 7,
    "free_training" to 8,
    "elliptical" to 11,
    "yoga" to 12,
    "rowing" to 13,
    "jump_rope" to 14,
    "hiit" to 16,
    "indoor_walking" to 333
  )

  private val WATCH_S5_MODELS = setOf("miwear.watch.p62g")
  private const val WATCH_S5_NAME = "Xiaomi Watch S5"
  private const val DECLARED_SOURCE = "declared Watch S5 sport set (the watch did not answer 2/39)"

  fun code(sport: String): Int? = CODES[sport]

  fun sport(code: Int): String? = CODES.entries.firstOrNull { it.value == code }?.key

  fun offered(codes: List<Int>): List<String> = CODES.filterValues { it in codes }.keys.toList()

  fun declared(model: String?, name: String): SportList? =
    if (model in WATCH_S5_MODELS || name.startsWith(WATCH_S5_NAME)) SportList(CODES.values.toList(), DECLARED_SOURCE) else null
}

private const val TREADMILL_SPORT_CODE = 3
