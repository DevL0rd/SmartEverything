package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

object PhoneContextInputs {
  private const val SETTLE_WORK = "expo.modules.healthconnect.phone.settle"

  @Synchronized
  fun feed(context: Context, input: ContextInput) {
    val store = PhoneStore(context)
    if (!store.enabled()) {
      return
    }
    apply(context, PhoneContextEngine.next(store.context(), input, Instant.now()))
  }

  @Synchronized
  fun settle(context: Context) {
    apply(context, PhoneContextEngine.settle(PhoneStore(context).context(), Instant.now()))
  }

  private fun apply(context: Context, outcome: ContextOutcome) {
    PhoneStore(context).setContext(outcome.snapshot)
    outcome.settleAfter?.let { schedule(context, it) }
    outcome.events.forEach { PhoneEvents.emit("context", it.kind, it.details) }
    if (outcome.events.any { it.kind == "parked" }) {
      PhoneParking.capture(context)
    }
    if (outcome.events.any { it.kind == "phone_context_changed" && it.details["to"] == ContextState.DRIVING.wire }) {
      PhoneParking.clear(context)
    }
    PhoneReporter.report(context, outcome.events)
  }

  private fun schedule(context: Context, delay: Duration) {
    val request = OneTimeWorkRequestBuilder<PhoneSettleWorker>()
      .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(SETTLE_WORK, ExistingWorkPolicy.REPLACE, request)
  }
}
