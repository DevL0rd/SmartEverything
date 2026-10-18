package expo.modules.healthconnect.phone

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle

object PhoneShowUnlock {
  fun show(context: Context): PhoneActionResult {
    if (!PhonePermissions.overlay(context)) throw PhoneUnlockPromptNeedsOverlay()
    context.startActivity(Intent(context, PhoneShowUnlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return PhoneActionResult(true, "Woke the phone to its unlock prompt")
  }
}

class PhoneShowUnlockActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    getSystemService(KeyguardManager::class.java).requestDismissKeyguard(
      this,
      object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = finish()

        override fun onDismissCancelled() = finish()

        override fun onDismissError() = finish()
      }
    )
  }
}
