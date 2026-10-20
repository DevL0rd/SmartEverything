package expo.modules.healthconnect.toothbrush

import android.bluetooth.le.ScanFilter
import expo.modules.healthconnect.sonicare.SonicareMatch

class BrushKind(val brand: String, val stack: String)

object BrushKinds {
  const val SONICARE = "sonicare"
  const val ORALB = "oralb"
  const val ORALB_COMPANY_ID = 220
  private const val ORALB_HEAD = "a0f0"
  private const val ORALB_TAIL = "-5047-4d53-8208-4f72616c2d42"
  private const val ORALB_UUID_LENGTH = 36
  private const val HEAD_LENGTH = 4
  private const val KEY_LENGTH = 4
  private val ORALB_DUMP_KEYS = setOf("ff01", "ff02", "ff04", "ff05", "ff07", "ff0a", "ff22", "ff25", "ff26", "ff29", "ff2b", "ff2d")

  fun kindOf(services: Set<String>, manufacturer: Map<Int, ByteArray>): BrushKind? {
    SonicareMatch.stackOf(services, manufacturer)?.let { return BrushKind(SONICARE, it) }
    return if (manufacturer.containsKey(ORALB_COMPANY_ID)) BrushKind(ORALB, ORALB) else null
  }

  fun associationFilter(stack: String): ScanFilter =
    if (stack == ORALB) {
      ScanFilter.Builder().setManufacturerData(ORALB_COMPANY_ID, ByteArray(0)).build()
    } else {
      SonicareMatch.associationFilter(stack)
    }

  fun dumpWanted(brand: String, characteristic: String): Boolean = when (brand) {
    ORALB -> characteristic.length == ORALB_UUID_LENGTH &&
      characteristic.startsWith(ORALB_HEAD) &&
      characteristic.endsWith(ORALB_TAIL) &&
      characteristic.substring(HEAD_LENGTH, HEAD_LENGTH + KEY_LENGTH) in ORALB_DUMP_KEYS
    else -> SonicareMatch.dumpWanted(characteristic)
  }
}
