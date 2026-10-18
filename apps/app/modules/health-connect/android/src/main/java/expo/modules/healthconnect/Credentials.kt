package expo.modules.healthconnect

import android.content.Context
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.network.HubRouteBinding
import expo.modules.healthconnect.network.HubRouteBindings
import expo.modules.healthconnect.network.HubRoutePolicy
import expo.modules.healthconnect.network.canonicalOrigin
import org.json.JSONObject

class NativeCredentialWithdrawn : SyncFailure("Native credential generation was withdrawn", retryable = false)

class IngestTarget(
  val endpoint: String,
  val token: String,
  val binding: (() -> HubRouteBinding)? = null,
  val policy: (() -> HubRoutePolicy)? = null,
)

enum class CredentialSlot(val preferences: String, val keyAlias: String, val kind: String) {
  SERVER("expo.modules.healthconnect.server", "expo.modules.healthconnect.server-token", "server"),
}

class Credentials(context: Context, private val slot: CredentialSlot = CredentialSlot.SERVER) {
  private val context = context.applicationContext
  private val preferences = context.getSharedPreferences(slot.preferences, Context.MODE_PRIVATE)
  private val box = KeystoreBox(slot.keyAlias)

  @Throws(SyncFailure::class)
  fun save(target: IngestTarget, enrollment: String) = synchronized(LOCK) {
    val ticket = EnrollmentTicket.parse(enrollment)
    ServerEnrollment(context).use(enrollment) {
      if (ticket.principalId != HubRouteBindings.fingerprint(target.token) || ticket.canonicalOrigin != canonicalOrigin(target.endpoint)) {
        NativeLog.warn(SCOPE, "credential.save_refused") { mapOf("slot" to slot.kind, "reason" to "ticket_mismatch", "generation" to ticket.generation) }
        throw NativeCredentialWithdrawn()
      }
      saveBound(target)
    }
  }

  private fun saveBound(target: IngestTarget) {
    val previous = stored()
    if (previous?.getString("endpoint") == target.endpoint && previous.getString("token") == target.token) {
      NativeLog.debug(SCOPE, "credential.unchanged") { mapOf("slot" to slot.kind, "generation" to previous.getLong("generation")) }
      return
    }
    val next = JSONObject().put("endpoint", target.endpoint).put("token", target.token)
      .put("generation", (previous?.getLong("generation") ?: 0) + 1)
    persist(next)
    NativeLog.info(SCOPE, "credential.saved") {
      mapOf("slot" to slot.kind, "generation" to next.getLong("generation"), "replaced" to (previous != null), "host" to NativeLog.hostOnly(target.endpoint), "principal" to HubRouteBindings.fingerprint(target.token).take(8))
    }
    withdrawRoute(previous)
  }

  @Throws(SyncFailure::class)
  @JvmOverloads
  fun clear(principal: String? = null) = synchronized(LOCK) {
    val previous = stored()
    ServerEnrollment(context).withdraw(principal)
    val storedPrincipal = previous?.let { HubRouteBindings.fingerprint(it.getString("token")) }
    if (principal != null && storedPrincipal != principal) {
      NativeLog.info(SCOPE, "credential.clear_skipped") { mapOf("slot" to slot.kind, "reason" to "other_principal", "requested" to principal.take(8), "stored" to storedPrincipal?.take(8)) }
      return@synchronized
    }
    require(preferences.edit().clear().commit()) { "Native credential could not be withdrawn" }
    NativeLog.info(SCOPE, "credential.cleared") { mapOf("slot" to slot.kind, "hadCredential" to (previous != null), "hadBinding" to (previous?.optJSONObject("binding") != null)) }
    withdrawRoute(previous)
  }

  @Throws(NativeCredentialWithdrawn::class)
  fun activate(canonical: String, principal: String): String = synchronized(LOCK) {
    val old = stored()?.let { HubRouteBindings.fingerprint(it.getString("token")) }
    val ticket = ServerEnrollment(context).activate(canonical, principal)
    NativeLog.info(SCOPE, "credential.activated") { mapOf("slot" to slot.kind, "principal" to principal.take(8), "previous" to old?.take(8), "clearsPrevious" to (old != null && old != principal)) }
    if (old != null && old != principal) clear(old)
    ticket
  }

  fun configured(): Boolean = preferences.contains(CREDENTIAL)

  fun load(): IngestTarget = synchronized(LOCK) {
    val saved = stored() ?: throw ServerNotConfigured()
    saved.optJSONObject("binding")?.let {
      if (!HubRoutePolicy.get(context).bound(HubRouteBinding.parse(it))) {
        NativeLog.warn(SCOPE, "credential.binding_dropped") { mapOf("slot" to slot.kind, "reason" to "route_authority_has_no_scope", "generation" to saved.getLong("generation")) }
        saved.remove("binding")
        saved.put("generation", saved.getLong("generation") + 1)
        persist(saved)
      }
    }
    val endpoint = saved.getString("endpoint")
    val token = saved.getString("token")
    val generation = saved.getLong("generation")
    IngestTarget(endpoint, token, { binding(endpoint, token, generation) }, { HubRoutePolicy.get(context) })
  }

  private fun binding(endpoint: String, token: String, generation: Long): HubRouteBinding = synchronized(LOCK) {
    val saved = stored() ?: throw NativeCredentialWithdrawn()
    if (saved.getString("endpoint") != endpoint || saved.getString("token") != token || saved.getLong("generation") != generation) {
      NativeLog.warn(SCOPE, "binding.stale") { mapOf("slot" to slot.kind, "askedGeneration" to generation, "storedGeneration" to saved.getLong("generation")) }
      throw NativeCredentialWithdrawn()
    }
    saved.optJSONObject("binding")?.let {
      val binding = HubRouteBinding.parse(it)
      if (!HubRoutePolicy.get(context).bound(binding)) {
        NativeLog.warn(SCOPE, "binding.withdrawn") { mapOf("slot" to slot.kind, "scope" to NativeLog.scopeLabel(binding.scopeId)) }
        throw NativeCredentialWithdrawn()
      }
      return@synchronized binding
    }
    val started = System.nanoTime()
    val bound = try {
      HubRouteBindings.register(context, IngestTarget(endpoint, token), slot.kind, generation)
    } catch (failure: Exception) {
      NativeLog.warn(SCOPE, "binding.register_failed", failure, NativeLog.elapsedMs(started)) { mapOf("slot" to slot.kind, "generation" to generation, "host" to NativeLog.hostOnly(endpoint)) }
      throw failure
    }
    saved.put("binding", bound.json())
    persist(saved)
    NativeLog.info(SCOPE, "binding.registered", NativeLog.elapsedMs(started)) { mapOf("slot" to slot.kind, "generation" to generation, "scope" to NativeLog.scopeLabel(bound.scopeId)) }
    bound
  }

  private fun withdrawRoute(previous: JSONObject?) {
    previous?.optJSONObject("binding")?.let { HubRoutePolicy.get(context).clear(it.getString("scopeId")) }
  }

  private fun stored(): JSONObject? = preferences.getString(CREDENTIAL, null)?.let { JSONObject(box.open(it)) }

  private fun persist(value: JSONObject) {
    require(preferences.edit().putString(CREDENTIAL, box.seal(value.toString())).commit()) {
      "Native encrypted credential could not be stored"
    }
  }

  private companion object {
    val LOCK = ServerEnrollment.LOCK
    const val CREDENTIAL = "credential-binding"
    const val SCOPE = "credentials"
  }
}
