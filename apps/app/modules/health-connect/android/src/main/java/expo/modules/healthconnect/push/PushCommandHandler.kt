package expo.modules.healthconnect.push

import android.content.Context

fun interface PushCommandHandler {
  fun handle(context: Context, data: Map<String, String>)
}
