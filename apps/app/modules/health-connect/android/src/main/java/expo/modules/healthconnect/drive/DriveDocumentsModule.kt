package expo.modules.healthconnect.drive

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriveDocumentsModule : Module() {
  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun notifyRoots() {
    context().contentResolver.notifyChange(DriveAuthority.rootsUri(context()), null)
  }

  override fun definition() = ModuleDefinition {
    Name("DriveDocuments")

    AsyncFunction("configure") { clientId: String ->
      val changed = DriveConfig(context()).configure(clientId)
      if (changed) {
        DriveProviderCache(context()).clear()
        DriveOfflineStore(context()).clear()
      }
      notifyRoots()
      DriveOfflineWorker.enqueue(context())
    }

    AsyncFunction("forget") {
      DriveConfig(context()).forget()
      DriveProviderCache(context()).clear()
      DriveOfflineStore(context()).clear()
      notifyRoots()
    }

    AsyncFunction("notifyChanged") { rootIds: List<String>, folderIds: List<String> ->
      val keys = rootIds.map { DriveDocumentId.Drive(it).wire } + folderIds.map { DriveDocumentId.Item(it).wire }
      DriveProviderCache(context()).invalidate(keys)
      keys.forEach { context().contentResolver.notifyChange(DriveAuthority.childrenUri(context(), it), null) }
    }

    AsyncFunction("offlineStatus") {
      val store = DriveOfflineStore(context())
      val files = store.all().filter { !it.folder }
      mapOf("usedBytes" to store.usedBytes(), "files" to files.size, "pins" to store.pins().size)
    }

    AsyncFunction("offlineSync") {
      DriveOfflineWorker.enqueue(context())
    }

    AsyncFunction("offlineClear") {
      DriveOfflineStore(context()).clear()
    }
  }
}
