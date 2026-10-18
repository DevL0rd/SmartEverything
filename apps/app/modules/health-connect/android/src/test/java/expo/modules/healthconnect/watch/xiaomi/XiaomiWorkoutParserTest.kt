package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.watch.ExerciseTypes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiWorkoutParserTest {
  private val start = FIXTURE_EPOCH
  private val end = FIXTURE_EPOCH + 1800

  @Test
  fun `an outdoor run summary reads start end type and title`() {
    val id = fileId(version = 4, subtype = 0x01, detail = XiaomiFileId.SUMMARY, sports = true)
    val workout = XiaomiWorkoutParser.summary(id, activityFile(body(4, start, end))).single()
    assertEquals(instant(), workout.start)
    assertEquals(instant(1800), workout.end)
    assertEquals(ExerciseTypes.RUNNING, workout.exerciseType)
    assertEquals("Outdoor run", workout.title)
  }

  @Test
  fun `a type first layout takes the exercise from the workout code`() {
    val id = fileId(version = 4, subtype = 0x16, detail = XiaomiFileId.SUMMARY, sports = true)
    val yoga = XiaomiWorkoutParser.summary(id, activityFile(body(7, start, end, code = 12))).single()
    assertEquals(ExerciseTypes.YOGA, yoga.exerciseType)
    assertEquals("Yoga", yoga.title)
    val unknownCode = XiaomiWorkoutParser.summary(id, activityFile(body(7, start, end, code = 99))).single()
    assertEquals("Outdoor walk", unknownCode.title)
    assertEquals(ExerciseTypes.WALKING, unknownCode.exerciseType)
  }

  @Test
  fun `a summary whose end is not after its start is dropped`() {
    val id = fileId(version = 4, subtype = 0x01, detail = XiaomiFileId.SUMMARY, sports = true)
    assertTrue(XiaomiWorkoutParser.summary(id, activityFile(body(4, end, start))).isEmpty())
  }

  @Test
  fun `an unknown workout type or version is rejected`() {
    val type = fileId(version = 4, subtype = 0x1f, detail = XiaomiFileId.SUMMARY, sports = true)
    assertThrows(UnsupportedFile::class.java) { XiaomiWorkoutParser.summary(type, activityFile(body(4, start, end))) }
    val version = fileId(version = 1, subtype = 0x01, detail = XiaomiFileId.SUMMARY, sports = true)
    assertThrows(UnsupportedFile::class.java) { XiaomiWorkoutParser.summary(version, activityFile(body(4, start, end))) }
  }

  private fun body(headerBytes: Int, startSeconds: Long, endSeconds: Long, code: Int? = null): ByteArray {
    val out = LittleEndianBytes().raw(ByteArray(headerBytes))
    if (code != null) out.u16(code)
    return out.u32(startSeconds).u32(endSeconds).toByteArray()
  }
}
