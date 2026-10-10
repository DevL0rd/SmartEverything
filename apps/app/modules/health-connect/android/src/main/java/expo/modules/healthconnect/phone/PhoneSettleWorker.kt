package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class PhoneSettleWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  override fun doWork(): Result {
    PhoneContextInputs.settle(applicationContext)
    return Result.success()
  }
}
