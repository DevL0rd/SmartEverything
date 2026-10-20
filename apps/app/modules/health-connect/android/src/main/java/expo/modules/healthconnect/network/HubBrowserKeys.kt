package expo.modules.healthconnect.network

import android.view.KeyEvent

object HubBrowserKeys {
  private const val FUNCTION_KEYS = 12

  private val named = mapOf(
    "Enter" to KeyEvent.KEYCODE_ENTER,
    "Tab" to KeyEvent.KEYCODE_TAB,
    "Escape" to KeyEvent.KEYCODE_ESCAPE,
    "Backspace" to KeyEvent.KEYCODE_DEL,
    "Delete" to KeyEvent.KEYCODE_FORWARD_DEL,
    "Insert" to KeyEvent.KEYCODE_INSERT,
    "Home" to KeyEvent.KEYCODE_MOVE_HOME,
    "End" to KeyEvent.KEYCODE_MOVE_END,
    "ArrowLeft" to KeyEvent.KEYCODE_DPAD_LEFT,
    "ArrowRight" to KeyEvent.KEYCODE_DPAD_RIGHT,
    "ArrowUp" to KeyEvent.KEYCODE_DPAD_UP,
    "ArrowDown" to KeyEvent.KEYCODE_DPAD_DOWN,
    "PageUp" to KeyEvent.KEYCODE_PAGE_UP,
    "PageDown" to KeyEvent.KEYCODE_PAGE_DOWN,
    " " to KeyEvent.KEYCODE_SPACE,
  )

  private val modifierFlags = mapOf(
    "ctrl" to (KeyEvent.META_CTRL_ON or KeyEvent.META_CTRL_LEFT_ON),
    "shift" to (KeyEvent.META_SHIFT_ON or KeyEvent.META_SHIFT_LEFT_ON),
    "alt" to (KeyEvent.META_ALT_ON or KeyEvent.META_ALT_LEFT_ON),
    "super" to (KeyEvent.META_META_ON or KeyEvent.META_META_LEFT_ON),
  )

  fun keyCode(key: String): Int? = named[key] ?: functionKey(key) ?: character(key)

  fun metaState(modifiers: List<String>): Int =
    modifiers.fold(0) { state, name ->
      state or (modifierFlags[name] ?: throw IllegalArgumentException("Unknown modifier $name"))
    }

  private fun functionKey(key: String): Int? {
    if (!key.startsWith("F")) return null
    val number = key.substring(1).toIntOrNull() ?: return null
    return if (number in 1..FUNCTION_KEYS) KeyEvent.KEYCODE_F1 + number - 1 else null
  }

  private fun character(key: String): Int? {
    if (key.length != 1) return null
    val letter = key[0].lowercaseChar()
    return when (letter) {
      in 'a'..'z' -> KeyEvent.KEYCODE_A + (letter - 'a')
      in '0'..'9' -> KeyEvent.KEYCODE_0 + (letter - '0')
      else -> null
    }
  }
}
