package expo.modules.healthconnect.watch

import android.content.Context
import org.json.JSONException
import org.json.JSONObject

object WatchRemote {
  fun run(context: Context, deviceId: String, actionJson: String, reply: (ActionOutcome) -> Unit) {
    val action = try {
      JSONObject(actionJson)
    } catch (failure: JSONException) {
      reply(ActionOutcome(false, "The action could not be read: ${failure.message}"))
      return
    }
    WatchEvents.emit("remote_action", action.getString("type"), mapOf("deviceId" to deviceId))
    when (val type = action.getString("type")) {
      "find_watch" -> reply(found(deviceId, action.getBoolean("on")))
      "sync" -> reply(service(context, WatchService.ACTION_SYNC, "Sync started on the phone."))
      "refresh" -> reply(service(context, WatchService.ACTION_REFRESH, "Asked the watch for its latest state and settings."))
      "set_setting" -> WatchActions.perform(deviceId, WatchRequest.SetSetting(action.getString("key"), rawOf(action.get("value"))), reply)
      "save_alarm" -> WatchActions.perform(deviceId, WatchRequest.SaveAlarm(AlarmInfo.of(action.getJSONObject("alarm"))), reply)
      "delete_alarm" -> WatchActions.perform(deviceId, WatchRequest.DeleteAlarm(action.getInt("id")), reply)
      "set_watch_face" -> WatchActions.perform(deviceId, WatchRequest.SetFace(action.getString("id")), reply)
      "delete_watch_face" -> WatchActions.perform(deviceId, WatchRequest.DeleteFace(action.getString("id")), reply)
      "start_workout" -> WatchActions.perform(deviceId, WatchRequest.StartWorkout(action.getString("sport")), reply)
      "pause_workout" -> WatchActions.perform(deviceId, WatchRequest.ChangeWorkout(WorkoutChange.PAUSE), reply)
      "resume_workout" -> WatchActions.perform(deviceId, WatchRequest.ChangeWorkout(WorkoutChange.RESUME), reply)
      "stop_workout" -> WatchActions.perform(deviceId, WatchRequest.ChangeWorkout(WorkoutChange.FINISH), reply)
      "debug_workout" -> WatchActions.perform(deviceId, WatchRequest.ProbeWorkout(action.getInt("sport"), action.getBoolean("on")), reply)
      else -> reply(ActionOutcome(false, "This app build does not know the watch action $type; update the app."))
    }
  }

  private fun rawOf(value: Any): Any = if (value is Boolean) value else value.toString()

  private fun found(deviceId: String, on: Boolean): ActionOutcome =
    if (WatchActions.sendTo(deviceId, WatchAction.FindWatch(on))) {
      ActionOutcome(true, if (on) "The watch is ringing." else "The watch stopped ringing.")
    } else {
      ActionOutcome(false, "The watch is not connected to this phone right now.")
    }

  private fun service(context: Context, action: String, detail: String): ActionOutcome {
    if (!WatchActions.connected()) {
      return ActionOutcome(false, "The watch is not connected to this phone right now.")
    }
    WatchService.send(context, action)
    return ActionOutcome(true, detail)
  }
}
