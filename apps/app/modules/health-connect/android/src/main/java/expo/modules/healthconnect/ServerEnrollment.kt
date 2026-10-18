package expo.modules.healthconnect

import android.content.Context
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.network.canonicalOrigin

class ServerEnrollment(context: Context) {
  private val preferences = context.getSharedPreferences("expo.modules.healthconnect.server-enrollment", Context.MODE_PRIVATE)
  private val box = KeystoreBox("expo.modules.healthconnect.server-enrollment")

  @Throws(NativeCredentialWithdrawn::class)
  fun activate(canonical: String, principal: String): String = synchronized(LOCK) {
    require(canonicalOrigin(canonical) == canonical && Regex("[0-9a-f]{64}").matches(principal))
    val current = state()
    val next = current.activate(canonical, principal)
    if (next !== current) persist(next)
    NativeLog.info(SCOPE, "enrollment.activated") {
      mapOf("principal" to principal.take(8), "from" to current.generation, "generation" to next.generation, "changed" to (next !== current), "previousPrincipal" to current.principalId?.take(8))
    }
    next.ticket(canonical, principal).toJson()
  }

  @Throws(NativeCredentialWithdrawn::class)
  fun capture(canonical: String, principal: String): String = synchronized(LOCK) {
    val current = state()
    try {
      current.ticket(canonical, principal).toJson().also {
        NativeLog.debug(SCOPE, "enrollment.captured") { mapOf("principal" to principal.take(8), "generation" to current.generation) }
      }
    } catch (failure: NativeCredentialWithdrawn) {
      NativeLog.warn(SCOPE, "enrollment.capture_refused", failure) {
        mapOf("principal" to principal.take(8), "generation" to current.generation, "enrolledPrincipal" to current.principalId?.take(8))
      }
      throw failure
    }
  }

  @Throws(NativeCredentialWithdrawn::class)
  fun <T> use(ticket: String, block: () -> T): T = synchronized(LOCK) {
    val current = state()
    val presented = EnrollmentTicket.parse(ticket)
    if (!current.admits(presented)) {
      NativeLog.warn(SCOPE, "enrollment.ticket_refused") {
        mapOf("presentedGeneration" to presented.generation, "generation" to current.generation, "principal" to presented.principalId.take(8), "enrolledPrincipal" to current.principalId?.take(8))
      }
      throw NativeCredentialWithdrawn()
    }
    block()
  }

  fun withdraw(principal: String?) = synchronized(LOCK) {
    val current = state()
    val next = current.withdraw(principal)
    if (next !== current) persist(next)
    NativeLog.info(SCOPE, "enrollment.withdrawn") { mapOf("principal" to principal?.take(8), "from" to current.generation, "generation" to next.generation, "changed" to (next !== current)) }
  }

  private fun state(): ServerEnrollmentState =
    preferences.getString(RECORD, null)?.let { ServerEnrollmentState.parse(box.open(it)) } ?: ServerEnrollmentState()

  private fun persist(state: ServerEnrollmentState) {
    require(preferences.edit().putString(RECORD, box.seal(state.toJson())).commit()) { "Native server enrollment could not be stored" }
  }

  companion object {
    val LOCK = Any()
    private const val SCOPE = "enrollment"
    private const val RECORD = "record"
  }
}
