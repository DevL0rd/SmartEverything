package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ExerciseTypes
import expo.modules.healthconnect.watch.Workout
import java.time.Instant

private class WorkoutLayout(val title: String, val exerciseType: Int, val typeFirst: Boolean, val headers: Map<Int, Int>)

object XiaomiWorkoutParser {
  private val LAYOUTS: Map<Int, WorkoutLayout> = mapOf(
    0x01 to WorkoutLayout("Outdoor run", ExerciseTypes.RUNNING, false, mapOf(4 to 4)),
    0x02 to WorkoutLayout("Outdoor walk", ExerciseTypes.WALKING, false, mapOf(4 to 4)),
    0x03 to WorkoutLayout("Treadmill", ExerciseTypes.RUNNING_TREADMILL, false, mapOf(5 to 4, 9 to 6, 10 to 8, 11 to 9)),
    0x06 to WorkoutLayout("Outdoor cycling", ExerciseTypes.BIKING, false, mapOf(4 to 5)),
    0x07 to WorkoutLayout("Indoor cycling", ExerciseTypes.BIKING_STATIONARY, false, mapOf(8 to 7, 9 to 8)),
    0x08 to WorkoutLayout("Workout", ExerciseTypes.OTHER, false, mapOf(5 to 3, 7 to 5, 8 to 6, 9 to 6, 10 to 6)),
    0x09 to WorkoutLayout("Pool swim", ExerciseTypes.SWIMMING_POOL, false, mapOf(6 to 4, 7 to 5, 8 to 8)),
    0x0B to WorkoutLayout("Elliptical", ExerciseTypes.ELLIPTICAL, false, mapOf(3 to 4, 4 to 4, 5 to 4, 6 to 4)),
    0x0D to WorkoutLayout("Rowing", ExerciseTypes.ROWING_MACHINE, false, mapOf(4 to 4, 6 to 5, 7 to 5, 8 to 6)),
    0x0E to WorkoutLayout("Jump rope", ExerciseTypes.OTHER, false, mapOf(3 to 5, 5 to 5)),
    0x10 to WorkoutLayout("HIIT", ExerciseTypes.HIIT, false, mapOf(5 to 4)),
    0x16 to WorkoutLayout("Outdoor walk", ExerciseTypes.WALKING, true, mapOf(1 to 5, 2 to 6, 4 to 7, 5 to 9, 6 to 9, 9 to 13)),
    0x17 to WorkoutLayout("Outdoor cycling", ExerciseTypes.BIKING, true, mapOf(4 to 6, 5 to 6, 6 to 7, 8 to 8))
  )

  private val BY_WORKOUT_CODE: Map<Int, Pair<String, Int>> = mapOf(
    1 to ("Outdoor run" to ExerciseTypes.RUNNING),
    2 to ("Walk" to ExerciseTypes.WALKING),
    3 to ("Hike" to ExerciseTypes.WALKING),
    4 to ("Trek" to ExerciseTypes.WALKING),
    5 to ("Trail run" to ExerciseTypes.RUNNING),
    6 to ("Outdoor cycling" to ExerciseTypes.BIKING),
    7 to ("Indoor cycling" to ExerciseTypes.BIKING_STATIONARY),
    9 to ("Pool swim" to ExerciseTypes.SWIMMING_POOL),
    11 to ("Elliptical" to ExerciseTypes.ELLIPTICAL),
    12 to ("Yoga" to ExerciseTypes.YOGA),
    13 to ("Rowing" to ExerciseTypes.ROWING_MACHINE),
    15 to ("Outdoor walk" to ExerciseTypes.WALKING)
  )

  fun summary(id: XiaomiFileId, file: ByteArray): List<Workout> {
    val layout = LAYOUTS[id.subtype]
      ?: throw UnsupportedFile(id, "workout type 0x%02x has no known summary layout".format(id.subtype))
    val headerSize = layout.headers[id.version]
      ?: throw UnsupportedFile(id, "${layout.title} summary version ${id.version} is not known (this app reads ${layout.headers.keys.sorted()})")
    val buffer = FileAssembler.body(file)
    buffer.position(buffer.position() + headerSize)
    val code = if (layout.typeFirst) buffer.getShort().toInt() and 0xffff else null
    val start = Instant.ofEpochSecond(buffer.getInt().toLong() and 0xffffffffL)
    val end = Instant.ofEpochSecond(buffer.getInt().toLong() and 0xffffffffL)
    if (!end.isAfter(start)) {
      return emptyList()
    }
    val (title, type) = code?.let { BY_WORKOUT_CODE[it] } ?: (layout.title to layout.exerciseType)
    return listOf(Workout(start, end, type, title))
  }
}
