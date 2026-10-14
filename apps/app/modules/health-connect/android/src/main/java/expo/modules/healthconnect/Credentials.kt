package expo.modules.healthconnect

import android.content.Context
import expo.modules.healthconnect.network.HubRouteBinding
import expo.modules.healthconnect.network.HubRouteBindings
import expo.modules.healthconnect.network.HubRoutePolicy
import org.json.JSONObject

class NativeCredentialWithdrawn : SyncFailure("Native credential generation was withdrawn", retryable = false)

class IngestTarget(val endpoint: String, val token: String, val binding: (() -> HubRouteBinding)? = null,
  val policy: (() -> HubRoutePolicy)? = null)

enum class CredentialSlot(val preferences: String, val keyAlias: String, val kind: String) {
  HEALTH_SOURCE("expo.modules.healthconnect.credentials", "expo.modules.healthconnect.source-token", "health-source"),
  SERVER("expo.modules.healthconnect.server", "expo.modules.healthconnect.server-token", "server")
}

class Credentials(context: Context, private val slot: CredentialSlot = CredentialSlot.HEALTH_SOURCE) {
  private val context = context.applicationContext
  private val preferences = context.getSharedPreferences(slot.preferences, Context.MODE_PRIVATE)
  private val box = KeystoreBox(slot.keyAlias)

  init { if (slot == CredentialSlot.SERVER) synchronized(LOCK) {
    preferences.getString(REVOKED, null)?.let {
      ServerEnrollment(context).withdraw(setOf(it))
      require(preferences.edit().remove(REVOKED).commit()) { "Legacy credential withdrawal could not be migrated" }
    }
  } }

  @Throws(SyncFailure::class) @JvmOverloads fun save(target: IngestTarget, enrollment: String? = null) = synchronized(LOCK) {
    if (slot == CredentialSlot.SERVER) {
      val authority = ServerEnrollment(context)
      val principal = HubRouteBindings.fingerprint(target.token)
      val canonical = expo.modules.healthconnect.network.canonicalOrigin(target.endpoint)
      val ticket = enrollment ?: authority.legacy(canonical, principal)
      authority.use(ticket) {
        val input = JSONObject(ticket)
        if (input.getString("principalId") != principal || input.getString("canonicalOrigin") != canonical) throw NativeCredentialWithdrawn()
        saveBound(target)
      }
    } else saveBound(target)
  }
  private fun saveBound(target: IngestTarget) {
    val previous = stored()
    if (previous?.getString("endpoint") == target.endpoint && previous.getString("token") == target.token) return
    val next = JSONObject().put("endpoint", target.endpoint).put("token", target.token)
      .put("generation", (previous?.getLong("generation") ?: 0) + 1)
    persist(next)
    previous?.optJSONObject("binding")?.let { HubRoutePolicy.get(context).clear(it.getString("scopeId")) }
  }

  @Throws(SyncFailure::class) @JvmOverloads fun clear(principal: String? = null) = synchronized(LOCK) {
    val previous = stored()
    if (slot == CredentialSlot.SERVER) {
      val storedPrincipal = previous?.let { HubRouteBindings.fingerprint(it.getString("token")) }
      val principals = listOfNotNull(principal, if (principal == null) storedPrincipal else null, preferences.getString(REVOKED, null)).toSet()
      ServerEnrollment(context).withdraw(principals, all = principal == null)
      if (principal != null && storedPrincipal != principal) return@synchronized
    }
    require(preferences.edit().clear().commit()) { "Native credential could not be withdrawn" }
    previous?.optJSONObject("binding")?.let { HubRoutePolicy.get(context).clear(it.getString("scopeId")) }
  }

  @Throws(NativeCredentialWithdrawn::class) fun activate(canonical: String, principal: String, intent: String): String =
    ServerEnrollment(context).useActivation(intent) { activateOwned(canonical, principal) }

  private fun activateOwned(canonical: String, principal: String): String {
    val previous = stored()
    val old = previous?.let { HubRouteBindings.fingerprint(it.getString("token")) }
    val ticket = ServerEnrollment(context).activate(canonical, principal)
    if (old != null && old != principal) clear(old)
    return ticket
  }

  fun configured(): Boolean = preferences.contains(CREDENTIAL) ||
    (preferences.getString(ENDPOINT, null) != null && preferences.getString(TOKEN, null) != null)

  fun load(): IngestTarget = synchronized(LOCK) {
    val saved = stored() ?: throw if (slot == CredentialSlot.SERVER) ScaleRelayNotConfigured() else SyncNotConfigured()
    saved.optJSONObject("binding")?.let {
      if (!HubRoutePolicy.get(context).bound(HubRouteBinding.parse(it))) {
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
    if (saved.getString("endpoint") != endpoint || saved.getString("token") != token || saved.getLong("generation") != generation)
      throw NativeCredentialWithdrawn()
    saved.optJSONObject("binding")?.let {
      val binding = HubRouteBinding.parse(it)
      if (!HubRoutePolicy.get(context).bound(binding)) throw NativeCredentialWithdrawn()
      return@synchronized binding
    }
    val target = IngestTarget(endpoint, token)
    val bound = HubRouteBindings.register(context, target, slot.kind, generation)
    saved.put("binding", bound.json())
    persist(saved)
    bound
  }

  private fun stored(): JSONObject? {
    val sealed = preferences.getString(CREDENTIAL, null)
    if (sealed != null) return JSONObject(box.open(sealed))
    val endpoint = preferences.getString(ENDPOINT, null)
    val token = preferences.getString(TOKEN, null)
    if (endpoint == null || token == null) return null
    return JSONObject().put("endpoint", endpoint).put("token", box.open(token)).put("generation", 0)
  }

  private fun persist(value: JSONObject) {
    require(preferences.edit().putString(CREDENTIAL, box.seal(value.toString())).remove(ENDPOINT).remove(TOKEN).commit()) {
      "Native encrypted credential could not be stored"
    }
  }

  private companion object {
    val LOCK = ServerEnrollment.LOCK
    const val REVOKED = "revoked-principal"
    const val CREDENTIAL = "credential-binding"
    const val ENDPOINT = "endpoint"
    const val TOKEN = "token"
  }
}
