package expo.modules.healthconnect.phone

import android.content.Context
import android.util.Log
import org.json.JSONObject

class PhoneReadingUnavailable(what: String, why: String, cause: Throwable? = null) : PhoneFailure("Could not read $what: $why", cause)

enum class PhoneSection(val wire: String, val slow: Boolean, val liveRefresh: Boolean = false) {
  POWER("power", slow = false),
  SOUND("sound", slow = false),
  SCREEN("screen", slow = false),
  NETWORK("network", slow = false),
  CONNECTIONS("connections", slow = false),
  STORAGE("storage", slow = true),
  APPS("apps", slow = true, liveRefresh = true),
  NOTIFICATIONS("notifications", slow = true, liveRefresh = true),
  ALARM("alarm", slow = false)
}

data class PhoneReadRequest(val live: Boolean, val slow: Boolean) {
  fun wants(section: PhoneSection): Boolean = !section.slow || slow || (live && section.liveRefresh)
}

interface PhoneDetailSource {
  val sections: Set<PhoneSection>

  fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> = emptyMap()

  fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject?

  fun startLive(context: Context) = Unit

  fun stopLive(context: Context) = Unit
}

class SlowReading<T> {
  private class Held<T>(val value: T)

  private var held: Held<T>? = null

  @Synchronized
  fun read(fresh: Boolean, compute: () -> T): T {
    val current = held
    if (current != null && !fresh) {
      return current.value
    }
    return compute().also { held = Held(it) }
  }
}

class PhoneDetailRead(val values: Map<String, Any?>, val sections: Map<PhoneSection, JSONObject>)

object PhoneDetailRegistry {
  private val readings: List<PhoneDetailSource> = listOf(PhonePower, PhoneSound, PhoneScreen, PhoneSignal, PhoneStorage, PhoneAlarm)

  val sources: List<PhoneDetailSource> by lazy { checked(readings + PhoneDetailSources.all) }

  fun checked(all: List<PhoneDetailSource>): List<PhoneDetailSource> {
    val owners = mutableMapOf<PhoneSection, PhoneDetailSource>()
    for (source in all) {
      for (section in source.sections) {
        val owner = owners.put(section, source)
        check(owner == null) {
          "The phone section ${section.wire} is produced by both ${owner?.javaClass?.simpleName} and ${source.javaClass.simpleName}; expected one source per section"
        }
      }
    }
    return all
  }

  fun read(context: Context, request: PhoneReadRequest, all: List<PhoneDetailSource> = sources): PhoneDetailRead {
    val values = mutableMapOf<String, Any?>()
    val sections = mutableMapOf<PhoneSection, JSONObject>()
    for (source in all) {
      PhoneGuard.run("${source.javaClass.simpleName} values") { source.values(context, request) }?.let { values.putAll(it) }
      for (section in source.sections.filter(request::wants)) {
        PhoneGuard.run("the ${section.wire} section") { source.section(context, section, request) }?.let { sections[section] = it }
      }
    }
    return PhoneDetailRead(values, sections)
  }
}

object PhoneGuard {
  private const val TAG = "SmartEverythingPhone"

  fun <T> run(what: String, block: () -> T): T? = try {
    block()
  } catch (failure: Exception) {
    val named = PhoneReadingUnavailable(what, "${failure.javaClass.simpleName}: ${failure.message.orEmpty()}", failure)
    Log.e(TAG, named.message.orEmpty(), failure)
    PhoneEvents.emit("reading_failed", named.message.orEmpty())
    null
  }
}
