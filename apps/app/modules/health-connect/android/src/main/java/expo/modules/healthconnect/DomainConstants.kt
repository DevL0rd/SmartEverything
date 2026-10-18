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
}
