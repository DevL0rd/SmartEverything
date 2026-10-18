package expo.modules.healthconnect

import android.content.SharedPreferences

class MemoryPreferences : SharedPreferences {
  private val values = mutableMapOf<String, Any?>()

  private inline fun <reified T> stored(key: String): T? = values[key].let { if (it is T) it else null }

  override fun getAll(): MutableMap<String, *> = values.toMutableMap()

  override fun getString(key: String, defValue: String?): String? = stored<String>(key) ?: defValue

  override fun getStringSet(key: String, defValues: MutableSet<String>?): MutableSet<String>? {
    return stored<Set<*>>(key)?.map { it.toString() }?.toMutableSet() ?: defValues
  }

  override fun getInt(key: String, defValue: Int): Int = stored<Int>(key) ?: defValue

  override fun getLong(key: String, defValue: Long): Long = stored<Long>(key) ?: defValue

  override fun getFloat(key: String, defValue: Float): Float = stored<Float>(key) ?: defValue

  override fun getBoolean(key: String, defValue: Boolean): Boolean = stored<Boolean>(key) ?: defValue

  override fun contains(key: String): Boolean = values.containsKey(key)

  override fun edit(): SharedPreferences.Editor = Editor()

  override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) = Unit

  override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) = Unit

  private inner class Editor : SharedPreferences.Editor {
    private val pending = mutableMapOf<String, Any?>()
    private val removed = mutableSetOf<String>()
    private var cleared = false

    override fun putString(key: String, value: String?) = apply { pending[key] = value }

    override fun putStringSet(key: String, values: MutableSet<String>?) = apply { pending[key] = values?.toSet() }

    override fun putInt(key: String, value: Int) = apply { pending[key] = value }

    override fun putLong(key: String, value: Long) = apply { pending[key] = value }

    override fun putFloat(key: String, value: Float) = apply { pending[key] = value }

    override fun putBoolean(key: String, value: Boolean) = apply { pending[key] = value }

    override fun remove(key: String) = apply { removed.add(key) }

    override fun clear() = apply { cleared = true }

    override fun commit(): Boolean {
      apply()
      return true
    }

    override fun apply() {
      if (cleared) values.clear()
      removed.forEach { values.remove(it) }
      values.putAll(pending)
    }
  }
}
