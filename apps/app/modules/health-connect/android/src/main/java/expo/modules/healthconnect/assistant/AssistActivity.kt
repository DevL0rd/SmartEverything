package expo.modules.healthconnect.assistant

import android.app.Activity
import android.os.Bundle

class AssistActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    startActivity(AssistantLink.call(this, "assist"))
    finish()
  }
}
