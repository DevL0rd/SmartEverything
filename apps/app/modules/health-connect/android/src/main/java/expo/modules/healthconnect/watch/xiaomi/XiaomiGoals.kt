package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.GoalInfo
import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WatchUser
import expo.modules.healthconnect.watch.parseProto

class XiaomiGoals(private val note: (String, String) -> Unit) {
  private val sent = mutableMapOf<String, Int>()
  private val reported = mutableMapOf<String, Int>()
  private var current: Set<Int>? = null
  private var supported: Set<Int>? = null

  fun request(): ByteArray = health(GOALS_GET)

  fun userSent(user: WatchUser) {
    sent.clear()
    sent[STEPS] = user.stepGoal
    sent[MOVE] = user.calorieGoal
    if (user.activeMinutes > 0) {
      sent[ACTIVE] = user.activeMinutes
    }
  }

  fun handle(command: XiaomiCommand): Boolean {
    if (command.type != XiaomiCommands.TYPE_HEALTH) {
      return false
    }
    val health = command.part(XiaomiCommand.HEALTH)
    return when (command.subtype) {
      GOALS_GET -> health?.message(FIELD_GOALS)?.let { config(it) }.let { true }
      GOALS_SET -> true
      USER_INFO -> health?.message(FIELD_USER)?.let { pushed(it) }.let { true }
      else -> false
    }
  }

  fun snapshot(): List<GoalInfo> {
    val ids = supported
    return ORDER.filter { (key, id) -> sent.containsKey(key) || reported.containsKey(key) || ids?.contains(id) == true }
      .map { (key, id) -> GoalInfo(key, sent[key], reported[key], current?.contains(id)) }
  }

  private fun config(message: ProtoMessage) {
    current = message.all(1).mapNotNull { parseProto(it).int(1) }.toSet()
    supported = message.all(2).mapNotNull { parseProto(it).int(1) }.toSet()
    note("goals_config", "shown=${current.orEmpty().sorted()} supported=${supported.orEmpty().sorted()}")
  }

  private fun pushed(user: ProtoMessage) {
    listOf(STEPS to 7, MOVE to 6, ACTIVE to 11, STANDING to 9).forEach { (key, field) ->
      user.int(field)?.let { reported[key] = it }
    }
    val changed = reported.filter { (key, value) -> sent[key] != null && sent[key] != value }
    if (changed.isNotEmpty()) {
      note("goal_changed_on_watch", changed.entries.joinToString { "${it.key}=${it.value} (sent ${sent[it.key]})" })
    }
  }

  private fun health(subtype: Int): ByteArray = ProtoWriter()
    .varint(1, XiaomiCommands.TYPE_HEALTH.toLong()).varint(2, subtype.toLong()).toByteArray()

  companion object {
    private const val USER_INFO = 0
    private const val GOALS_GET = 42
    private const val GOALS_SET = 43
    private const val FIELD_USER = 1
    private const val FIELD_GOALS = 38
    const val STEPS = "steps"
    const val MOVE = "move_kcal"
    const val ACTIVE = "active_minutes"
    const val STANDING = "standing_hours"
    private val ORDER = listOf(STEPS to 1, MOVE to 2, ACTIVE to 3, STANDING to 4)
  }
}
