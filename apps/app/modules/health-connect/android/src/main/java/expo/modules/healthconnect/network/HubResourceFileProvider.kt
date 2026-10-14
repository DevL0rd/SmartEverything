package expo.modules.healthconnect.network

import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.FileNotFoundException

class HubResourceFileProvider : androidx.core.content.FileProvider() {
  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw FileNotFoundException("Hub resources are read only")
    val parts = uri.pathSegments
    if (parts.size != 3 || parts[0] != "hub-resources") throw FileNotFoundException("Invalid private resource path")
    if (!Regex("[A-Za-z0-9._ -]{1,200}").matches(parts[2]) || parts[2] in listOf(".", "..") || uri.query != null || uri.fragment != null)
      throw FileNotFoundException("Invalid private resource filename")
    val authority = grants ?: throw FileNotFoundException("Private resource grant is withdrawn")
    try { authority.get(parts[1]).checkFile(parts[2]) } catch (failure: Exception) { throw FileNotFoundException("Private resource grant is withdrawn") }
    return super.openFile(uri, mode) ?: throw FileNotFoundException("Private resource file could not be opened")
  }
  companion object { @Volatile var grants: HubResourceGrants? = null }
}
