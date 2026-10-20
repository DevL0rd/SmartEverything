package expo.modules.healthconnect.oralb

object OralbAdvert {
  const val RUNNING = 3
  const val SUMMARY = 9
  const val POST_BRUSHING = 10
  private const val STATE_INDEX = 3
  private const val BYTE_MASK = 0xFF

  fun stateOf(data: ByteArray): Int? = data.getOrNull(STATE_INDEX)?.let { it.toInt() and BYTE_MASK }

  fun isSummary(state: Int): Boolean = state == SUMMARY || state == POST_BRUSHING

  fun isRelayed(state: Int): Boolean = state == RUNNING || isSummary(state)
}
