package expo.modules.healthconnect

import org.json.JSONObject

private fun JSONObject.stringOrNull(key: String): String? = if (isNull(key)) null else getString(key)

data class EnrollmentTicket(val canonicalOrigin: String, val principalId: String, val generation: Long) {
  fun toJson(): String = JSONObject()
    .put("canonicalOrigin", canonicalOrigin)
    .put("principalId", principalId)
    .put("generation", generation)
    .toString()

  companion object {
    fun parse(json: String): EnrollmentTicket {
      val value = JSONObject(json)
      return EnrollmentTicket(value.getString("canonicalOrigin"), value.getString("principalId"), value.getLong("generation"))
    }
  }
}

data class ServerEnrollmentState(
  val generation: Long = 0,
  val canonicalOrigin: String? = null,
  val principalId: String? = null,
) {
  fun activate(canonical: String, principal: String): ServerEnrollmentState =
    if (canonicalOrigin == canonical && principalId == principal) this else ServerEnrollmentState(generation + 1, canonical, principal)

  fun withdraw(principal: String?): ServerEnrollmentState =
    if (principalId == null || (principal != null && principal != principalId)) this else ServerEnrollmentState(generation + 1)

  @Throws(NativeCredentialWithdrawn::class)
  fun ticket(canonical: String, principal: String): EnrollmentTicket {
    if (canonicalOrigin != canonical || principalId != principal) throw NativeCredentialWithdrawn()
    return EnrollmentTicket(canonical, principal, generation)
  }

  fun admits(ticket: EnrollmentTicket): Boolean =
    ticket.generation == generation && ticket.canonicalOrigin == canonicalOrigin && ticket.principalId == principalId

  fun toJson(): String = JSONObject()
    .put("generation", generation)
    .put("canonicalOrigin", canonicalOrigin ?: JSONObject.NULL)
    .put("principalId", principalId ?: JSONObject.NULL)
    .toString()

  companion object {
    fun parse(json: String): ServerEnrollmentState {
      val value = JSONObject(json)
      return ServerEnrollmentState(
        value.getLong("generation"),
        value.stringOrNull("canonicalOrigin"),
        value.stringOrNull("principalId"),
      )
    }
  }
}
