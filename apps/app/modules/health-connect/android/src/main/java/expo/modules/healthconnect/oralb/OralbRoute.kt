package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toHex
import expo.modules.healthconnect.toothbrush.BrushAdvert
import expo.modules.healthconnect.toothbrush.BrushKinds
import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import java.time.Instant

interface OralbActions {
  fun connect(address: String)

  fun sync(address: String)

  fun relay(plan: LinkPlan, adverts: List<BrushAdvert>, closing: Boolean)
}

private class Seen(val state: Int, val advert: BrushAdvert)

class OralbRoute(
  private val actions: OralbActions,
  private val held: (LinkPlan) -> Boolean,
  private val busy: OralbBusy,
  private val pace: OralbPace,
  private val clock: () -> Long
) {
  fun woken(plan: LinkPlan, heard: List<Heard>) {
    val now = clock()
    val seen = heard.mapNotNull { seenOf(it, now) }
    if (seen.isEmpty()) return
    val running = seen.any { it.state == OralbAdvert.RUNNING }
    if (running) {
      busy.running(plan.address, now)
      pace.reset(plan.address, OralbAttempt.SYNC)
    }
    if (held(plan)) return
    if (running && liveConnected(plan) && pace.allow(plan.address, OralbAttempt.CONNECT, now)) {
      actions.connect(plan.address)
      return
    }
    relay(plan, seen)
    val summary = seen.any { OralbAdvert.isSummary(it.state) }
    if (summary && plan.sync.isNotEmpty() && pace.allow(plan.address, OralbAttempt.SYNC, now)) {
      actions.sync(plan.address)
    }
  }

  private fun relay(plan: LinkPlan, seen: List<Seen>) {
    val relayed = seen.filter { OralbAdvert.isRelayed(it.state) }
    if (relayed.isEmpty()) return
    actions.relay(plan, relayed.map { it.advert }, relayed.any { it.state != OralbAdvert.RUNNING })
  }

  private fun liveConnected(plan: LinkPlan): Boolean = plan.subscriptions.isNotEmpty()

  private fun seenOf(heard: Heard, now: Long): Seen? {
    val data = heard.manufacturer[BrushKinds.ORALB_COMPANY_ID] ?: return null
    val state = OralbAdvert.stateOf(data) ?: return null
    return Seen(state, BrushAdvert(Instant.ofEpochMilli(now - heard.ageMs).toString(), heard.rssi, data.toHex()))
  }
}
