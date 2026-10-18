package expo.modules.healthconnect.overlay

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

class OverlaySurfaceFacts(context: Context, private val changed: () -> Unit) {
  private val keyguard = context.getSystemService(KeyguardManager::class.java)
  private val power = context.getSystemService(PowerManager::class.java)

  var foreground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    private set

  var locked = keyguard.isKeyguardLocked
    private set

  var screenOn = power.isInteractive
    private set

  init {
    ProcessLifecycleOwner.get().lifecycle.addObserver(
      object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) = moved(true)

        override fun onStop(owner: LifecycleOwner) = moved(false)
      }
    )
    val screen = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    context.registerReceiver(
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = screenMoved()
      },
      screen
    )
  }

  private fun moved(front: Boolean) {
    foreground = front
    locked = keyguard.isKeyguardLocked
    changed()
  }

  private fun screenMoved() {
    locked = keyguard.isKeyguardLocked
    screenOn = power.isInteractive
    changed()
  }
}
