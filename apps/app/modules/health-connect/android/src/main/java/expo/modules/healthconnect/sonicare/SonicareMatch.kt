package expo.modules.healthconnect.sonicare

import android.bluetooth.le.ScanFilter
import android.content.Context
import android.os.ParcelUuid
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.toothbrush.BrushMatcher
import expo.modules.healthconnect.toothbrush.BrushService
import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import java.util.UUID

object SonicareMatch : BrushMatcher {
  const val COMPANY_ID = 477
  const val CLASSIC_SERVICE = "477ea600-a260-11e4-ae37-0002a5d50001"
  const val CONDOR_SERVICE = "e50ba3c0-af04-4564-92ad-fef019489de6"
  private const val CONDOR_TEXT = "Condor"
  private const val CLOCK = "4050"
  private const val ROUTINES = "4022"

  override val brand = "sonicare"

  override fun matching(heard: Heard, plans: List<LinkPlan>): LinkPlan? = when {
    condorText(heard) || CONDOR_SERVICE in heard.services -> plans.firstOrNull { it.condor }
    CLASSIC_SERVICE in heard.services -> plans.firstOrNull { !it.condor && it.address.equals(heard.address, ignoreCase = true) }
    else -> null
  }

  override fun woken(context: Context, plan: LinkPlan, heard: List<Heard>) {
    NativeGuard.run("SonicareMatch") {
      BrushService.send(context, BrushService.ACTION_CONNECT, plan.address)
    }
  }

  fun stackOf(services: Set<String>, manufacturer: Map<Int, ByteArray>): String? {
    val condor = CONDOR_SERVICE in services || manufacturer[COMPANY_ID]?.let { startsWithCondor(it) } == true
    return when {
      condor -> "condor"
      CLASSIC_SERVICE in services -> "classic"
      else -> null
    }
  }

  fun associationFilter(stack: String): ScanFilter = ScanFilter.Builder().also {
    if (stack == "condor") {
      val text = CONDOR_TEXT.toByteArray()
      it.setManufacturerData(COMPANY_ID, text, ByteArray(text.size) { -1 })
    } else {
      it.setServiceUuid(ParcelUuid(UUID.fromString(CLASSIC_SERVICE)))
    }
  }.build()

  fun dumpWanted(characteristic: String): Boolean = characteristic.endsWith(CLOCK) || characteristic.endsWith(ROUTINES)

  private fun condorText(heard: Heard): Boolean = heard.manufacturer[COMPANY_ID]?.let { startsWithCondor(it) } == true

  private fun startsWithCondor(bytes: ByteArray): Boolean = String(bytes).startsWith(CONDOR_TEXT)
}
