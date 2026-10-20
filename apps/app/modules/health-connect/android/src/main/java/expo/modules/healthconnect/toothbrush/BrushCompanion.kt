package expo.modules.healthconnect.toothbrush

import android.app.Activity
import android.companion.AssociationInfo
import android.companion.AssociationRequest
import android.companion.BluetoothLeDeviceFilter
import android.companion.CompanionDeviceManager
import android.companion.ObservingDevicePresenceRequest
import android.content.Context
import android.content.IntentSender
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.healthconnect.CompanionNeedsNewerAndroid
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

object BrushCompanion {
  private const val REQUEST_CODE = 7408

  fun associated(context: Context, address: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    return associationOf(manager(context), address) != null
  }

  suspend fun associate(activity: Activity, stack: String): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) throw CompanionNeedsNewerAndroid(Build.VERSION.SDK_INT)
    val manager = manager(activity)
    return suspendCancellableCoroutine { continuation ->
      manager.associate(request(stack), Executor { it.run() }, object : CompanionDeviceManager.Callback() {
        override fun onAssociationPending(intentSender: IntentSender) {
          activity.startIntentSenderForResult(intentSender, REQUEST_CODE, null, 0, 0, 0)
        }

        override fun onAssociationCreated(info: AssociationInfo) {
          observe(manager, info)
          if (continuation.isActive) continuation.resume(info.deviceMacAddress?.toString()?.uppercase().orEmpty())
        }

        override fun onFailure(error: CharSequence?) {
          if (continuation.isActive) continuation.resume("failed: ${error ?: "no reason given"}")
        }
      })
    }
  }

  fun observeAll(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val manager = manager(context)
    BrushStore(context).plans().forEach { plan ->
      associationOf(manager, plan.address)?.let { observe(manager, it) }
    }
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun request(stack: String): AssociationRequest {
    return AssociationRequest.Builder()
      .addDeviceFilter(BluetoothLeDeviceFilter.Builder().setScanFilter(BrushKinds.associationFilter(stack)).build())
      .setSingleDevice(true)
      .build()
  }

  private fun manager(context: Context): CompanionDeviceManager =
    context.getSystemService(CompanionDeviceManager::class.java)

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun associationOf(manager: CompanionDeviceManager, address: String): AssociationInfo? =
    manager.myAssociations.firstOrNull { it.deviceMacAddress?.toString().equals(address, ignoreCase = true) }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun observe(manager: CompanionDeviceManager, info: AssociationInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
      manager.startObservingDevicePresence(ObservingDevicePresenceRequest.Builder().setAssociationId(info.id).build())
    } else {
      info.deviceMacAddress?.let {
        @Suppress("DEPRECATION")
        manager.startObservingDevicePresence(it.toString())
      }
    }
  }
}
