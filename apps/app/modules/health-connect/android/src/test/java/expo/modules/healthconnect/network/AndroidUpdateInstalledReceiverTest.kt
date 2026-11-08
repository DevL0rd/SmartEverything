package expo.modules.healthconnect.network

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Test

class AndroidUpdateInstalledReceiverTest {
  private val receiver = AndroidUpdateInstalledReceiver()
  private val notifications = mockk<NotificationManager>(relaxed = true)
  private val context = mockk<Context> {
    every { getSystemService(NotificationManager::class.java) } returns notifications
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `relaunches the app after package replacement where Android allows it`() {
    val launcher = launchable()
    mockkStatic(Settings::class)
    every { Settings.canDrawOverlays(context) } returns true
    every { launcher.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) } returns launcher
    every { context.startActivity(launcher) } returns Unit

    receiver.onReceive(context, broadcast(Intent.ACTION_MY_PACKAGE_REPLACED))

    verify(exactly = 1) { context.startActivity(launcher) }
    verify(exactly = 0) { notifications.notify(any<Int>(), any()) }
  }

  @Test
  fun `falls back to one notification that opens the app and creates the channel once`() {
    val launcher = launchable()
    val notification = mockk<Notification>()
    val open = mockk<PendingIntent>()
    mockkStatic(Settings::class)
    every { Settings.canDrawOverlays(context) } returns false
    every { notifications.areNotificationsEnabled() } returns true
    every { notifications.getNotificationChannel(any()) } returns null
    mockkStatic(PendingIntent::class)
    every { PendingIntent.getActivity(context, any(), launcher, PendingIntent.FLAG_IMMUTABLE) } returns open
    mockkConstructor(Notification.Builder::class)
    every { anyConstructed<Notification.Builder>().build() } returns notification

    receiver.onReceive(context, broadcast(Intent.ACTION_MY_PACKAGE_REPLACED))

    verify(exactly = 1) { notifications.createNotificationChannel(any()) }
    verify(exactly = 1) { anyConstructed<Notification.Builder>().setContentIntent(open) }
    verify(exactly = 1) { notifications.notify(any<Int>(), notification) }
    verify(exactly = 0) { context.startActivity(any<Intent>()) }
  }

  @Test
  fun `does not recreate an existing notification channel`() {
    launchable()
    mockkStatic(Settings::class)
    every { Settings.canDrawOverlays(context) } returns false
    every { notifications.areNotificationsEnabled() } returns true
    every { notifications.getNotificationChannel(any()) } returns mockk<NotificationChannel>()
    mockkStatic(PendingIntent::class)
    every { PendingIntent.getActivity(context, any(), any(), PendingIntent.FLAG_IMMUTABLE) } returns mockk()
    mockkConstructor(Notification.Builder::class)
    every { anyConstructed<Notification.Builder>().build() } returns mockk()

    receiver.onReceive(context, broadcast(Intent.ACTION_MY_PACKAGE_REPLACED))

    verify(exactly = 0) { notifications.createNotificationChannel(any()) }
  }

  @Test
  fun `stays silent when it cannot relaunch and notifications are disabled`() {
    launchable()
    mockkStatic(Settings::class)
    every { Settings.canDrawOverlays(context) } returns false
    every { notifications.areNotificationsEnabled() } returns false

    receiver.onReceive(context, broadcast(Intent.ACTION_MY_PACKAGE_REPLACED))

    verify(exactly = 0) { notifications.createNotificationChannel(any()) }
    verify(exactly = 0) { notifications.notify(any<Int>(), any()) }
    verify(exactly = 0) { context.startActivity(any<Intent>()) }
  }

  @Test
  fun `ignores events other than replacement of this package`() {
    receiver.onReceive(context, broadcast(Intent.ACTION_PACKAGE_REPLACED))

    verify(exactly = 0) { context.startActivity(any<Intent>()) }
    verify(exactly = 0) { context.getSystemService(NotificationManager::class.java) }
  }

  private fun launchable(): Intent {
    val launcher = mockk<Intent>()
    val packages = mockk<PackageManager>()
    every { context.packageName } returns "com.example.app"
    every { context.packageManager } returns packages
    every { packages.getLaunchIntentForPackage("com.example.app") } returns launcher
    return launcher
  }

  private fun broadcast(action: String): Intent = mockk {
    every { this@mockk.action } returns action
  }
}
