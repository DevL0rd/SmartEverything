package expo.modules.healthconnect.phone

import android.content.Context
import expo.modules.healthconnect.KeystoreBox

class PhoneVault(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val box = KeystoreBox(KEY_ALIAS)

  fun read(key: String): String? = preferences.getString(key, null)?.let { box.open(it) }

  fun write(key: String, plain: String?) {
    preferences.edit().putString(key, plain?.let { box.seal(it) }).apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.phone.vault"
    const val KEY_ALIAS = "expo.modules.healthconnect.phone-vault"
  }
}
