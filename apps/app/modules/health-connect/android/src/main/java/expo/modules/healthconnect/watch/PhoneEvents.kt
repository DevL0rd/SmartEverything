package expo.modules.healthconnect.watch

import android.content.Context

object PhoneEvents {
  fun handle(context: Context, event: WatchEvent) {
    WatchEvents.emit("watch_event", event.label)
    when (event) {
      is WatchEvent.FindPhone -> findPhone(context, event.on)
      is WatchEvent.RejectCall -> CallRelay.reject(context)
      is WatchEvent.IgnoreCall -> CallRelay.mute(context)
      is WatchEvent.MediaKey -> listener("media control")?.press(event.key)
      is WatchEvent.MusicWanted -> listener("music")?.let { WatchActions.send(WatchAction.Music(it.musicState())) }
      is WatchEvent.DismissNotification -> listener("notification dismiss")?.dismiss(event.id)
      is WatchEvent.OpenNotification -> listener("open on phone")?.open(event.id)
    }
  }

  private fun findPhone(context: Context, on: Boolean) {
    if (!on) {
      FindPhone.stop(context)
      return
    }
    if (NotificationRules.read(context).findPhone) {
      FindPhone.start(context)
    } else {
      WatchEvents.emit("find_phone_off", "the watch asked to ring this phone, but Find my phone is turned off")
    }
  }

  private fun listener(what: String): WatchNotificationListener? {
    val active = WatchNotificationListener.active
    if (active == null) {
      WatchEvents.emit("notification_access_missing", "$what from the watch needs notification access for SmartEverything")
    }
    return active
  }
}
