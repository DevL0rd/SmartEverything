package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ActionOutcome
import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WorkoutChange
import expo.modules.healthconnect.watch.WorkoutInfo
import expo.modules.healthconnect.watch.WorkoutState
import expo.modules.healthconnect.watch.parseProto
import java.time.Instant
import java.util.TimeZone

class XiaomiWorkoutHooks(
  val send: (ByteArray) -> Unit,
  val note: (String, String) -> Unit,
  val changed: (WorkoutInfo) -> Unit,
  val sportsRead: () -> Unit,
  val finished: () -> Unit
)

class XiaomiWorkouts(
  private val hooks: XiaomiWorkoutHooks,
  private val declared: SportList?,
  remembered: WorkoutInfo? = null
) {
  private var reported: List<Int>? = null
  private var declaredNoted = false
  private var current: WorkoutInfo? = remembered?.takeIf { it.active }
  private var probing: Int? = null

  private val codes: List<Int>?
    get() = reported ?: declared?.codes?.also {
      if (!declaredNoted) {
        declaredNoted = true
        hooks.note("workout_types_declared", declared.source)
      }
    }

  fun sports(): List<String> = XiaomiSports.offered(codes.orEmpty())

  fun types(command: XiaomiCommand) {
    val list = command.part(XiaomiCommand.SYSTEM)?.message(SYSTEM_WORKOUT_TYPES)?.all(1).orEmpty()
      .mapNotNull { parseProto(it).int(1) }
    reported = list
    hooks.note("workout_types", list.joinToString(","))
    hooks.sportsRead()
  }

  fun handle(command: XiaomiCommand): Boolean {
    val health = command.part(XiaomiCommand.HEALTH)
    when (command.subtype) {
      STATUS -> health?.message(FIELD_STATUS)?.let { status(it) }
      OPEN -> health?.message(FIELD_OPEN)?.let { open(it) }
      STATS -> health?.message(FIELD_STATS)?.let { stats(it) }
      else -> return false
    }
    return true
  }

  fun start(sport: String): ActionOutcome {
    val code = XiaomiSports.code(sport)
      ?: return ActionOutcome(false, "This app can’t start $sport on this watch yet.")
    if (codes?.contains(code) != true) {
      return ActionOutcome(false, "The watch doesn’t offer $sport.")
    }
    if (current?.active == true) {
      return ActionOutcome(false, "A workout is already running on the watch; stop it first.")
    }
    hooks.send(statusCommand(code, STARTED))
    update(WorkoutInfo(sport, WorkoutState.RUNNING, Instant.now(), startedFromPhone = true))
    return ActionOutcome(true, "Started $sport on the watch.")
  }

  fun change(change: WorkoutChange): ActionOutcome {
    val status = when (change) {
      WorkoutChange.PAUSE -> PAUSED
      WorkoutChange.RESUME -> RESUMED
      WorkoutChange.FINISH -> FINISHED
    }
    val workout = current?.takeIf { it.active } ?: return ActionOutcome(false, "No workout is running on the watch.")
    val code = XiaomiSports.code(workout.sport) ?: return ActionOutcome(false, "This app can’t control ${workout.sport}.")
    if (status == FINISHED) {
      hooks.send(statusCommand(code, PAUSED))
    }
    hooks.send(statusCommand(code, status))
    apply(workout, status)
    return ActionOutcome(true, DONE.getValue(status))
  }

  fun probe(code: Int, on: Boolean): ActionOutcome {
    val offered = codes
    if (offered != null && code !in offered) {
      return ActionOutcome(false, "The watch does not offer sport $code; it offers ${offered.joinToString(",")}.")
    }
    probing = if (on) code else null
    if (!on) {
      hooks.send(statusCommand(code, PAUSED))
    }
    hooks.send(statusCommand(code, if (on) STARTED else FINISHED))
    return ActionOutcome(true, "Asked the watch to ${if (on) "start" else "finish"} sport $code.")
  }

  private fun status(message: ProtoMessage) {
    val code = message.int(3)
    val status = message.int(4)
    hooks.note("workout_status", "status=$status sport=$code files=${message.bytes(FIELD_STATUS_FILES)?.size ?: 0} bytes")
    val sport = code?.let { XiaomiSports.sport(it) } ?: return
    val workout = current?.takeIf { it.active && it.sport == sport }
    when {
      status == STARTED && workout == null ->
        update(WorkoutInfo(sport, WorkoutState.RUNNING, Instant.now(), startedFromPhone = false))
      workout != null && status != null && status != STARTED -> apply(workout, status)
    }
  }

  private fun apply(workout: WorkoutInfo, status: Int) {
    val now = Instant.now()
    when (status) {
      PAUSED -> update(workout.paused(now))
      RESUMED -> update(workout.resumed(now))
      FINISHED -> {
        update(workout.finished(now))
        hooks.finished()
      }
    }
  }

  private fun open(message: ProtoMessage) {
    val code = message.int(1)
    val ours = code != null && (code == probing || code == current?.takeIf { it.startedFromPhone && it.active }?.sport?.let { XiaomiSports.code(it) })
    hooks.note("workout_open", "sport=$code versions=${message.int(2)} phone=$ours")
    val reply = if (ours) {
      ProtoWriter().varint(1, OPEN_OK).varint(2, PROTOCOL_VERSION).varint(3, GPS_HIGH)
    } else {
      ProtoWriter().varint(1, OPEN_NO_PERMISSION).varint(2, PROTOCOL_VERSION).varint(3, GPS_UNKNOWN)
    }
    hooks.send(health(OPEN, ProtoWriter().message(FIELD_OPEN_REPLY, reply)))
  }

  private fun stats(message: ProtoMessage) {
    val workout = current?.takeIf { it.active }
    if (workout == null) {
      hooks.note("workout_stats", "hr=${message.int(1)} kcal=${message.int(2)} with no workout known")
      return
    }
    update(
      workout.copy(
        heartRate = message.int(1)?.takeIf { it > 0 } ?: workout.heartRate,
        kcal = message.int(2) ?: workout.kcal,
        steps = message.int(3) ?: workout.steps,
        distanceM = message.int(4) ?: workout.distanceM,
        updatedAt = Instant.now()
      )
    )
  }

  private fun update(workout: WorkoutInfo) {
    current = workout
    hooks.changed(workout)
  }

  private fun statusCommand(code: Int, status: Int): ByteArray {
    val now = System.currentTimeMillis()
    val quarters = TimeZone.getDefault().getOffset(now) / QUARTER_HOUR_MS
    val body = ProtoWriter()
      .varint(1, now / 1000)
      .message(2, ProtoWriter().sint(1, quarters))
      .varint(3, code.toLong())
      .varint(4, status.toLong())
      .varint(6, PROTOCOL_VERSION)
    return health(STATUS, ProtoWriter().message(FIELD_STATUS, body))
  }

  private fun health(subtype: Int, body: ProtoWriter): ByteArray = ProtoWriter()
    .varint(1, XiaomiCommands.TYPE_HEALTH.toLong())
    .varint(2, subtype.toLong())
    .message(XiaomiCommand.HEALTH, body)
    .toByteArray()

  companion object {
    const val SYSTEM_WORKOUT_TYPES_GET = 39
    private const val PAUSED = 1
    private const val RESUMED = 2
    private const val FINISHED = 3
    private const val STARTED = 0
    private val DONE = mapOf(
      PAUSED to "Paused the workout.",
      RESUMED to "Resumed the workout.",
      FINISHED to "Finished the workout; it syncs from the watch next."
    )
    private const val SYSTEM_WORKOUT_TYPES = 14
    private const val STATUS = 26
    private const val OPEN = 30
    private const val STATS = 50
    private const val FIELD_STATUS = 20
    private const val FIELD_STATUS_FILES = 5
    private const val FIELD_OPEN = 25
    private const val FIELD_OPEN_REPLY = 26
    private const val FIELD_STATS = 42
    private const val OPEN_OK = 0L
    private const val OPEN_NO_PERMISSION = 3L
    private const val PROTOCOL_VERSION = 2L
    private const val GPS_HIGH = 2L
    private const val GPS_UNKNOWN = 10L
    private const val QUARTER_HOUR_MS = 900_000
  }
}
