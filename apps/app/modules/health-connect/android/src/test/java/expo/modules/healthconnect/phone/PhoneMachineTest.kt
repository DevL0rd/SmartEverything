package expo.modules.healthconnect.phone

import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneMachineTest {
  private fun supports(
    sdk: Int = Build.VERSION_CODES.UPSIDE_DOWN_CAKE,
    flashlight: Boolean = true,
    accessibility: Boolean = true,
    overlay: Boolean = true
  ): Map<String, FeatureState> = PhoneMachine.supports(MachineFacts(sdk, flashlight, accessibility, overlay)).toMap()

  @Test
  fun `every machine action is reported exactly once`() {
    val actions = PhoneMachine.supports(MachineFacts(Build.VERSION_CODES.UPSIDE_DOWN_CAKE, true, true, true)).map { it.first }
    assertEquals(
      listOf("ring", "stop_ring", "flashlight", "launch_app", "open", "screenshot", "lock", "unlock", "show_unlock", "receive_file"),
      actions
    )
  }

  @Test
  fun `a phone with the accessibility service on can lock and take screenshots`() {
    val all = supports()
    assertTrue(all.getValue("lock") is FeatureState.Ready)
    assertTrue(all.getValue("screenshot") is FeatureState.Ready)
  }

  @Test
  fun `without the accessibility service locking and screenshots name the permission to grant`() {
    val all = supports(accessibility = false)
    listOf("lock", "screenshot").forEach { action ->
      val state = all.getValue(action) as FeatureState.NeedsPermission
      assertEquals("android_accessibility", state.permission)
    }
  }

  @Test
  fun `an old Android says what it needs instead of asking for a permission that cannot help`() {
    val all = supports(sdk = Build.VERSION_CODES.O, accessibility = false)
    assertEquals("Screenshots need Android 11 or newer", (all.getValue("screenshot") as FeatureState.Unsupported).reason)
    assertEquals("Locking needs Android 9 or newer", (all.getValue("lock") as FeatureState.Unsupported).reason)
    assertTrue(all.getValue("receive_file") is FeatureState.Unsupported)
  }

  @Test
  fun `the unlock prompt needs display over other apps and unlocking is never offered`() {
    assertEquals("android_overlay", (supports(overlay = false).getValue("show_unlock") as FeatureState.NeedsPermission).permission)
    assertTrue(supports().getValue("show_unlock") is FeatureState.Ready)
    assertTrue(supports().getValue("unlock") is FeatureState.Unsupported)
  }

  @Test
  fun `a phone without a flashlight says so`() {
    assertEquals("This phone has no flashlight", (supports(flashlight = false).getValue("flashlight") as FeatureState.Unsupported).reason)
  }

  @Test
  fun `a state is written the way the hub reads it`() {
    val ready = PhoneMachine.json("action", "ring", FeatureState.Ready)
    assertEquals("ready", ready.getString("state"))
    val needs = PhoneMachine.json("action", "lock", FeatureState.NeedsPermission("android_accessibility", "Turn it on"))
    assertEquals("needs_permission", needs.getString("state"))
    assertEquals("android_accessibility", needs.getString("permission"))
    assertEquals("Turn it on", needs.getString("reason"))
    val cannot = PhoneMachine.json("action", "unlock", FeatureState.Unsupported("No"))
    assertEquals("unsupported", cannot.getString("state"))
    assertEquals("No", cannot.getString("reason"))
  }
}
