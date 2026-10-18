package expo.modules.healthconnect

import android.app.Activity
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import androidx.activity.result.ActivityResultCallback
import androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlin.coroutines.EmptyCoroutineContext
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthPermissionRequestsTest {
  private val steps = "android.permission.health.READ_STEPS"
  private val speed = "android.permission.health.WRITE_SPEED"
  private val activity = mockk<Activity>()
  private val service = mockk<Permissions>()
  private val appContext = mockk<AppContext> {
    every { currentActivity } returns activity
    every { permissions } returns service
  }

  private fun declaring(vararg names: String): Context {
    val info = PackageInfo().apply { requestedPermissions = arrayOf(*names) }
    val manager = mockk<PackageManager> {
      every { getPackageInfo("app", PackageManager.GET_PERMISSIONS) } returns info
    }
    return mockk {
      every { packageName } returns "app"
      every { packageManager } returns manager
    }
  }

  private fun requester(route: PermissionRoute) =
    HealthPermissionRequester(appContext, EmptyCoroutineContext) { _, _ -> route }

  private fun answering(granted: Set<String>): List<String> {
    val asked = mutableListOf<String>()
    every { service.askForPermissions(any(), *anyVararg()) } answers {
      val names = args.filterIsInstance<Array<*>>().flatMap { it.filterIsInstance<String>() }
      asked += names
      firstArg<PermissionsResponseListener>().onResult(
        names.associateWith {
          PermissionsResponse(if (it in granted) PermissionsStatus.GRANTED else PermissionsStatus.DENIED)
        }
      )
    }
    return asked
  }

  @Test fun theAndroidRuntimePermissionIntentTakesTheRuntimeRoute() {
    assertEquals(PermissionRoute.RUNTIME, PermissionRoute.of(RequestMultiplePermissions.ACTION_REQUEST_PERMISSIONS))
    assertEquals(PermissionRoute.ACTIVITY_RESULT, PermissionRoute.of("androidx.health.ACTION_REQUEST_PERMISSIONS"))
    assertEquals(PermissionRoute.ACTIVITY_RESULT, PermissionRoute.of(null))
  }

  @Test fun missingListsOnlyWantedPermissionsTheManifestLacks() {
    assertEquals(setOf(speed), DeclaredPermissions.missing(setOf(steps, speed), listOf(steps, "other")))
    assertTrue(DeclaredPermissions.missing(setOf(steps), listOf(steps)).isEmpty())
  }

  @Test fun anUndeclaredPermissionFailsLoudlyBeforeAnyScreenIsShown() {
    val failure = assertThrows(HealthPermissionsUndeclared::class.java) {
      runBlocking { requester(PermissionRoute.RUNTIME).request(declaring(steps), setOf(steps, speed)) }
    }
    assertTrue(failure.message.orEmpty().contains(speed))
    verify(exactly = 0) { service.askForPermissions(any(), *anyVararg()) }
  }

  @Test fun theRuntimeRouteResumesWhenAndroidAnswersEvenWithNothingGranted() {
    answering(emptySet())
    runBlocking { requester(PermissionRoute.RUNTIME).request(declaring(steps, speed), setOf(steps, speed)) }
    verify(exactly = 1) { service.askForPermissions(any(), *anyVararg()) }
  }

  @Test fun theRuntimeRouteAsksForEveryWantedPermission() {
    val asked = answering(setOf(steps))
    runBlocking { requester(PermissionRoute.RUNTIME).request(declaring(steps, speed), setOf(steps, speed)) }
    assertEquals(setOf(steps, speed), asked.toSet())
  }

  @Test fun theActivityResultRouteResumesWithTheScreensAnswer() {
    val launched = mutableListOf<PermissionSet>()
    val subject = requester(PermissionRoute.ACTIVITY_RESULT)
    subject.launcher = object : AppContextActivityResultLauncher<PermissionSet, Set<String>>() {
      override fun launch(input: PermissionSet, callback: ActivityResultCallback<Set<String>>) {
        launched += input
        callback.onActivityResult(setOf(steps))
      }

      override val contract = mockk<AppContextActivityResultContract<PermissionSet, Set<String>>>()
    }
    runBlocking { subject.request(declaring(steps), setOf(steps)) }
    assertEquals(listOf(steps), launched.single().permissions)
  }

  @Test fun noAttachedActivityIsReportedInsteadOfWaiting() {
    every { appContext.currentActivity } returns null
    assertThrows(PermissionScreenUnavailable::class.java) {
      runBlocking { requester(PermissionRoute.RUNTIME).request(declaring(steps), setOf(steps)) }
    }
  }
}
