package expo.modules.healthconnect

import android.content.Context
import expo.modules.healthconnect.network.canonicalOrigin
import org.json.JSONArray
import org.json.JSONObject

class ServerEnrollment(context: Context) {
  private val preferences = context.getSharedPreferences("expo.modules.healthconnect.server-enrollment", Context.MODE_PRIVATE)
  private val box = KeystoreBox("expo.modules.healthconnect.server-enrollment")
  fun beginActivationOwner(): Long = synchronized(LOCK) {
    val state = state()
    val owner = state.optLong("activationOwner", 0) + 1
    state.put("activationOwner", owner).put("activationOrder", 0).put("activationStamp", state.optLong("activationStamp", 0) + 1)
    persist(state)
    owner
  }
  fun endActivationOwner(owner: Long) = synchronized(LOCK) {
    val state = state()
    if (state.optLong("activationOwner", 0) == owner) {
      state.put("activationOwner", owner + 1).put("activationOrder", 0).put("activationStamp", state.optLong("activationStamp", 0) + 1)
      persist(state)
    }
  }
  @Throws(NativeCredentialWithdrawn::class) fun reserveActivation(owner: Long, order: Long): String = synchronized(LOCK) {
    require(order > 0)
    val state = state()
    if (state.optLong("activationOwner", 0) != owner || order < state.optLong("activationOrder", 0)) throw NativeCredentialWithdrawn()
    if (order > state.optLong("activationOrder", 0)) {
      state.put("activationOrder", order).put("activationStamp", state.optLong("activationStamp", 0) + 1)
      persist(state)
    }
    JSONObject().put("owner", owner).put("order", order).put("stamp", state.getLong("activationStamp")).toString()
  }
  @Throws(NativeCredentialWithdrawn::class) fun <T> useActivation(intent: String, block: () -> T): T = synchronized(LOCK) {
    val input = JSONObject(intent)
    require(input.length() == 3)
    val state = state()
    if (input.getLong("owner") != state.optLong("activationOwner", 0) ||
      input.getLong("order") != state.optLong("activationOrder", 0) ||
      input.getLong("stamp") != state.optLong("activationStamp", 0)) throw NativeCredentialWithdrawn()
    block()
  }
  @Throws(NativeCredentialWithdrawn::class) fun activate(canonical: String, principal: String): String = synchronized(LOCK) {
    require(canonicalOrigin(canonical) == canonical && Regex("[0-9a-f]{64}").matches(principal))
    val state = state()
    if (revoked(state).contains(principal)) throw NativeCredentialWithdrawn()
    val previous = state.optString("principalId").takeIf { it.isNotEmpty() }
    if (previous == principal && state.optString("canonicalOrigin") != canonical) throw NativeCredentialWithdrawn()
    if (previous != principal) {
      if (previous != null) state.put("revoked", JSONArray((revoked(state) + previous).toList()))
      state.put("epoch", state.getLong("epoch") + 1).put("scopeEpoch", state.getLong("epoch")).put("configurationGeneration", 0).put("principalId", principal).put("canonicalOrigin", canonical).put("scopeId", "")
      persist(state)
    }
    ticket(state)
  }
  @Throws(NativeCredentialWithdrawn::class) fun claim(canonical: String, principal: String, scope: String): String = synchronized(LOCK) {
    require(scope.length in 1..200)
    val state = state()
    active(state, canonical, principal)
    if (state.getString("scopeId") != scope) {
      if (state.getString("scopeId").isNotEmpty()) state.put("epoch", state.getLong("epoch") + 1)
      state.put("scopeId", scope).put("configurationGeneration", 0).put("scopeEpoch", state.getLong("epoch"))
      persist(state)
    }
    ticket(state)
  }
  @Throws(NativeCredentialWithdrawn::class) fun capture(canonical: String, principal: String): String = synchronized(LOCK) {
    val state = state(); active(state, canonical, principal); ticket(state)
  }
  @Throws(NativeCredentialWithdrawn::class) fun legacy(canonical: String, principal: String): String = synchronized(LOCK) {
    val state = state()
    if (state.getLong("epoch") == 0L) activate(canonical, principal) else capture(canonical, principal)
  }
  @Throws(NativeCredentialWithdrawn::class) fun <T> use(input: String, scope: String? = null, generation: Long? = null, block: () -> T): T = synchronized(LOCK) {
    val supplied = JSONObject(input)
    require(supplied.length() == 4)
    val state = state()
    active(state, supplied.getString("canonicalOrigin"), supplied.getString("principalId"))
    val current = supplied.getLong("epoch") == state.getLong("epoch")
    val newerConfiguration = scope != null && generation != null && supplied.getLong("epoch") >= state.getLong("scopeEpoch") &&
      generation >= state.optLong("configurationGeneration", 0)
    if ((!current && !newerConfiguration) || (scope != null && (state.getString("scopeId") != scope || supplied.getString("scopeId") != scope)))
      throw NativeCredentialWithdrawn()
    block()
  }
  fun advance(scope: String, generation: Long) = synchronized(LOCK) {
    val state = state()
    if (state.optString("scopeId") != scope) throw NativeCredentialWithdrawn()
    if (generation > state.optLong("configurationGeneration", 0)) {
      state.put("configurationGeneration", generation).put("epoch", state.getLong("epoch") + 1)
      persist(state)
    }
  }
  fun retire(scope: String) = synchronized(LOCK) {
    val state = state()
    if (state.optString("scopeId") == scope) {
      state.put("scopeId", "").put("epoch", state.getLong("epoch") + 1)
      persist(state)
    }
  }
  fun withdraw(principals: Set<String>, all: Boolean = false) = synchronized(LOCK) {
    val state = state()
    val active = state.optString("principalId").takeIf { it.isNotEmpty() }
    val withdrawn = revoked(state) + principals + if (all) listOfNotNull(active) else emptyList()
    state.put("revoked", JSONArray(withdrawn.toList()))
    if (all || active in principals) {
      state.put("epoch", state.getLong("epoch") + 1).remove("principalId")
      state.remove("canonicalOrigin"); state.remove("scopeId")
    }
    persist(state)
  }
  private fun active(state: JSONObject, canonical: String, principal: String) {
    if (state.optString("canonicalOrigin") != canonical || state.optString("principalId") != principal || revoked(state).contains(principal))
      throw NativeCredentialWithdrawn()
  }
  private fun revoked(state: JSONObject): Set<String> {
    val values = state.getJSONArray("revoked")
    return (0 until values.length()).map { values.getString(it) }.toSet()
  }
  private fun ticket(state: JSONObject): String = JSONObject().put("epoch", state.getLong("epoch"))
    .put("canonicalOrigin", state.getString("canonicalOrigin")).put("principalId", state.getString("principalId"))
    .put("scopeId", state.getString("scopeId")).toString()
  private fun state(): JSONObject = preferences.getString("state", null)?.let { JSONObject(box.open(it)) }
    ?: JSONObject().put("epoch", 0).put("revoked", JSONArray())
  private fun persist(state: JSONObject) {
    require(preferences.edit().putString("state", box.seal(state.toString())).commit()) { "Native server enrollment could not be stored" }
  }
  companion object { val LOCK = Any() }
}
