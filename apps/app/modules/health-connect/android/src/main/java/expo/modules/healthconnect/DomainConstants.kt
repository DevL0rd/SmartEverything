package expo.modules.healthconnect

object DomainConstants {
  const val HEALTH_BATCH_LIMIT = 500
  const val OUTREACH_RING_SECONDS = 45
  const val PUSH_COMMAND_KEY = "command"
  const val PUSH_PAYLOAD_KEY = "payload"
  const val PUSH_COMMAND_PHONE_ACTION = "phone_action"
  const val PUSH_COMMAND_MACHINE_APPROVAL = "machine_approval"
  const val PUSH_COMMAND_MACHINE_APPROVAL_CANCEL = "machine_approval_cancel"
  const val PUSH_COMMAND_WATCH_ACTION = "watch_action"
  const val PUSH_COMMAND_TREADMILL_ACTION = "treadmill_action"
  const val PUSH_COMMAND_BOTTLE_ACTION = "bottle_action"
  const val PUSH_COMMAND_TOOTHBRUSH_ACTION = "toothbrush_action"
  const val PUSH_COMMAND_AI_SPEECH = "ai_speech"
  const val PUSH_COMMAND_AI_RING = "ai_ring"
  const val PUSH_COMMAND_AI_RING_CANCEL = "ai_ring_cancel"

  val WATCH_SPORTS: List<String> = listOf(
    "treadmill",
    "indoor_walking",
    "outdoor_running",
    "walking",
    "indoor_cycling",
    "outdoor_cycling",
    "elliptical",
    "rowing",
    "free_training",
    "hiit",
    "yoga",
    "jump_rope"
  )

  val PHONE_SETTINGS_PAGES: List<String> = listOf(
    "wifi",
    "bluetooth",
    "internet",
    "location",
    "airplane",
    "nfc",
    "battery_saver",
    "display",
    "sound",
    "dnd_access",
    "write_settings",
    "app_details"
  )

  val PHONE_SYSTEM_TOGGLES: List<String> = listOf(
    "auto_rotate",
    "haptic_feedback",
    "touch_sounds"
  )

  val PHONE_SCREEN_TIMEOUTS: List<Int> = listOf(15, 30, 60, 120, 300, 600, 1800)
}
