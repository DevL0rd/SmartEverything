package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.expectIs
import java.time.Instant
import java.util.zip.CRC32

const val FIXTURE_EPOCH = 1_700_000_000L

fun fileId(version: Int, subtype: Int, detail: Int, sports: Boolean = false, seconds: Long = FIXTURE_EPOCH): XiaomiFileId {
  val flags = (if (sports) 0x80 else 0) or (subtype shl 2) or detail
  val bytes = LittleEndianBytes().u32(seconds).u8(4).u8(version).u8(flags).toByteArray()
  return XiaomiFileId(bytes)
}

fun activityFile(body: ByteArray): ByteArray {
  val head = LittleEndianBytes().raw(ByteArray(8)).raw(body).toByteArray()
  val crc = CRC32().apply { update(head) }.value
  return head + LittleEndianBytes().u32(crc).toByteArray()
}

fun instant(offsetSeconds: Long = 0): Instant = Instant.ofEpochSecond(FIXTURE_EPOCH + offsetSeconds)

fun Parsed.complete(): Parsed.Complete = expectIs()
