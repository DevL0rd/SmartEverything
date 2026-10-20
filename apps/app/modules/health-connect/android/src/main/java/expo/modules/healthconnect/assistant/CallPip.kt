package expo.modules.healthconnect.assistant

import android.app.Activity
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import android.util.Rational
import expo.modules.healthconnect.overlay.OverlayControl
import expo.modules.healthconnect.overlay.OverlayHostRule
import expo.modules.healthconnect.overlay.OverlayStage

object CallPip {
  private const val TAG = "SmartEverythingCalls"
  private const val WIDTH = 3
  private const val HEIGHT = 4
  private const val SUPPORTS_PICTURE_IN_PICTURE_FLAG = 0x400000

  @Volatile
  private var wanted = false

  fun want(activity: Activity, on: Boolean) {
    wanted = on
    refresh(activity)
  }

  fun refresh(activity: Activity) {
    if (!supported(activity)) return
    activity.runOnUiThread {
      try {
        activity.setPictureInPictureParams(params(activity))
      } catch (failure: IllegalStateException) {
        Log.e(TAG, "The system refused picture in picture params: ${failure.message}; ${describe(activity)}")
      }
    }
  }

  fun enterIfWanted(activity: Activity) {
    if (!autoEnter() || !supported(activity) || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
    try {
      activity.enterPictureInPictureMode(params(activity))
    } catch (failure: IllegalStateException) {
      Log.e(TAG, "The app could not enter picture in picture: ${failure.message}; ${describe(activity)}")
    }
  }

  private fun describe(activity: Activity): String =
    "activity=${activity.componentName.flattenToShortString()} display=${activity.display?.displayId} " +
      "multiWindow=${activity.isInMultiWindowMode} inPip=${activity.isInPictureInPictureMode}"

  private fun autoEnter(): Boolean = OverlayHostRule.pipAutoEnter(wanted, OverlayStage.barAvailable())

  private fun supported(activity: Activity): Boolean {
    if (!activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return false
    val info = activity.packageManager.getActivityInfo(activity.componentName, 0)
    val declared = info.flags and SUPPORTS_PICTURE_IN_PICTURE_FLAG != 0
    if (!declared) Log.d(TAG, "Picture in picture skipped: ${activity.componentName.flattenToShortString()} does not declare supportsPictureInPicture")
    return declared
  }

  private fun params(activity: Activity): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(WIDTH, HEIGHT))
      .setActions(
        listOf(
          action(activity, "Mute", android.R.drawable.ic_lock_silent_mode, OverlayControl.Mute),
          action(activity, "End call", android.R.drawable.ic_menu_close_clear_cancel, OverlayControl.End)
        )
      )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoEnter())
    return builder.build()
  }

  private fun action(activity: Activity, label: String, icon: Int, control: OverlayControl): RemoteAction =
    RemoteAction(Icon.createWithResource(activity, icon), label, label, CallActions.pending(activity, control))
}
