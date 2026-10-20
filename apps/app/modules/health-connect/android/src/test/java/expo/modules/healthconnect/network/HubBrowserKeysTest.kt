package expo.modules.healthconnect.network

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class HubBrowserKeysTest {
  @Test fun namedKeysMapToTheirKeyCodes() {
    assertEquals(KeyEvent.KEYCODE_ENTER, HubBrowserKeys.keyCode("Enter"))
    assertEquals(KeyEvent.KEYCODE_DPAD_LEFT, HubBrowserKeys.keyCode("ArrowLeft"))
    assertEquals(KeyEvent.KEYCODE_SPACE, HubBrowserKeys.keyCode(" "))
    assertEquals(KeyEvent.KEYCODE_FORWARD_DEL, HubBrowserKeys.keyCode("Delete"))
  }

  @Test fun functionKeysRunFromOneToTwelve() {
    assertEquals(KeyEvent.KEYCODE_F1, HubBrowserKeys.keyCode("F1"))
    assertEquals(KeyEvent.KEYCODE_F1 + 11, HubBrowserKeys.keyCode("F12"))
    assertNull(HubBrowserKeys.keyCode("F13"))
    assertNull(HubBrowserKeys.keyCode("F0"))
    assertNull(HubBrowserKeys.keyCode("Fx"))
  }

  @Test fun lettersAndDigitsMapIgnoringCase() {
    assertEquals(KeyEvent.KEYCODE_A, HubBrowserKeys.keyCode("a"))
    assertEquals(KeyEvent.KEYCODE_A + 25, HubBrowserKeys.keyCode("Z"))
    assertEquals(KeyEvent.KEYCODE_0 + 7, HubBrowserKeys.keyCode("7"))
  }

  @Test fun anythingElseHasNoKeyCode() {
    assertNull(HubBrowserKeys.keyCode("€"))
    assertNull(HubBrowserKeys.keyCode("Banana"))
    assertNull(HubBrowserKeys.keyCode("-"))
  }

  @Test fun modifiersCombineIntoOneMetaState() {
    assertEquals(0, HubBrowserKeys.metaState(emptyList()))
    val state = HubBrowserKeys.metaState(listOf("ctrl", "shift"))
    assertEquals(true, state and KeyEvent.META_CTRL_ON != 0)
    assertEquals(true, state and KeyEvent.META_SHIFT_ON != 0)
    assertEquals(0, state and KeyEvent.META_ALT_ON)
    assertEquals(true, HubBrowserKeys.metaState(listOf("super")) and KeyEvent.META_META_ON != 0)
    assertEquals(true, HubBrowserKeys.metaState(listOf("alt")) and KeyEvent.META_ALT_ON != 0)
  }

  @Test fun anUnknownModifierFailsLoudly() {
    assertThrows(IllegalArgumentException::class.java) { HubBrowserKeys.metaState(listOf("hyper")) }
  }
}
