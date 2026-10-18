package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.HubJson

object WatchUserStore {
  private const val PREFERENCES = "expo.modules.healthconnect.watch-user"

  fun save(context: Context, user: WatchUser) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("user", HubJson.encode(user)).apply()
  }

  fun read(context: Context): WatchUser? =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("user", null)?.let { HubJson.decode<WatchUser>(it) }
}
