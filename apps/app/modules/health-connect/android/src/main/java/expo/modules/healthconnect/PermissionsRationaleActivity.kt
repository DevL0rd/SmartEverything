package expo.modules.healthconnect

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle

class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
    val policy = info.metaData?.getString(PRIVACY_POLICY_KEY)
      ?: throw IllegalStateException(
        "$PRIVACY_POLICY_KEY is missing from the manifest; add the health-connect config plugin " +
          "with privacyPolicyUrl"
      )
    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(policy)))
    finish()
  }

  private companion object {
    const val PRIVACY_POLICY_KEY = "expo.modules.healthconnect.PRIVACY_POLICY_URL"
  }
}
