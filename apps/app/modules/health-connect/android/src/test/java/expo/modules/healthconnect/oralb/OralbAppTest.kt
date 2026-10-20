package expo.modules.healthconnect.oralb

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OralbAppTest {
  private val manager = mockk<PackageManager>()
  private val context = mockk<Context> { every { packageManager } returns manager }

  @Test
  fun `detects the installed Oral-B app`() {
    every { manager.getPackageInfo("com.pg.oralb.oralbapp", 0) } returns PackageInfo()
    assertTrue(OralbApp.installed(context))
  }

  @Test
  fun `reports the app absent when the package is not found`() {
    every { manager.getPackageInfo("com.pg.oralb.oralbapp", 0) } throws PackageManager.NameNotFoundException()
    assertFalse(OralbApp.installed(context))
  }

  @Test
  fun `the report detail names the state`() {
    assertEquals("oralb_app=installed", OralbApp.marker(true))
    assertEquals("oralb_app=absent", OralbApp.marker(false))
  }
}
