package expo.modules.healthconnect.oralb

import android.content.Context
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.toothbrush.BrushAdvert
import expo.modules.healthconnect.toothbrush.BrushKinds
import expo.modules.healthconnect.toothbrush.BrushLinks
import expo.modules.healthconnect.toothbrush.BrushListener
import expo.modules.healthconnect.toothbrush.BrushMatcher
import expo.modules.healthconnect.toothbrush.BrushOutbox
import expo.modules.healthconnect.toothbrush.BrushService
import expo.modules.healthconnect.toothbrush.BrushUpload
import expo.modules.healthconnect.toothbrush.FrameBatch
import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import expo.modules.healthconnect.toothbrush.LinkReport

object OralbMatch : BrushMatcher {
  override val brand = BrushKinds.ORALB

  private val clock: () -> Long = { System.currentTimeMillis() }
  private val busy = OralbBusy()
  private val pace = OralbPace()
  private val adverts = OralbAdverts(clock)

  override fun matching(heard: Heard, plans: List<LinkPlan>): LinkPlan? {
    val data = heard.manufacturer[BrushKinds.ORALB_COMPANY_ID] ?: return null
    if (OralbAdvert.stateOf(data) == null) return null
    return plans.firstOrNull { it.address.equals(heard.address, ignoreCase = true) }
  }

  override fun woken(context: Context, plan: LinkPlan, heard: List<Heard>) {
    NativeGuard.run("OralbMatch") {
      OralbRoute(PhoneActions(context.applicationContext), ::held, busy, pace, clock).woken(plan, heard)
    }
  }

  fun watch(context: Context, plan: LinkPlan, listener: BrushListener): BrushListener =
    if (plan.brand != BrushKinds.ORALB) {
      listener
    } else {
      OralbWatch(listener, plan.address, busy, OralbApp.marker(OralbApp.installed(context)), clock)
    }

  private fun held(plan: LinkPlan): Boolean = BrushLinks.of(plan.deviceId) != null

  private class PhoneActions(private val context: Context) : OralbActions {
    override fun connect(address: String) {
      BrushService.send(context, BrushService.ACTION_CONNECT, address)
    }

    override fun sync(address: String) {
      BrushService.send(context, BrushService.ACTION_SYNC, address)
    }

    override fun relay(plan: LinkPlan, adverts: List<BrushAdvert>, closing: Boolean) {
      OralbMatch.adverts.add(plan.deviceId, adverts, closing) { batch -> remember(plan, batch) }
    }

    private fun remember(plan: LinkPlan, batch: List<BrushAdvert>) {
      val report = LinkReport("asleep", batch.last().rssi, OralbApp.marker(OralbApp.installed(context)))
      BrushOutbox.remember(context, plan.deviceId, HubJson.encode(FrameBatch(emptyList(), report, batch)))
      BrushUpload.resume(context)
    }
  }
}
