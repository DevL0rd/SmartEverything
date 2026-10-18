package expo.modules.healthconnect.network

import android.content.Context
import android.util.AtomicFile
import expo.modules.healthconnect.KeystoreBox
import java.io.File
import org.json.JSONArray

class HubRouteStore(context: Context) {
  private val file = AtomicFile(File(context.filesDir, "hub-route-bindings.enc"))
  private val selectedFile = AtomicFile(File(context.filesDir, "hub-route-selected.enc"))
  private val box = KeystoreBox("expo.modules.healthconnect.hub-routes")

  @Synchronized fun load(): List<HubRouteConfiguration> {
    if (!exists(file)) return emptyList()
    val input = JSONArray(box.open(String(file.readFully(), Charsets.UTF_8)))
    return (0 until input.length()).map { HubRouteConfiguration.parse(input.getJSONObject(it)) }
  }

  @Synchronized fun save(configurations: Collection<HubRouteConfiguration>) {
    write(file, JSONArray(configurations.map { it.toJson() }).toString())
  }

  @Synchronized internal fun loadSelected(): Map<String, HubRouteEndpoint> {
    if (!exists(selectedFile)) return emptyMap()
    return HubRouteSelection.decode(box.open(String(selectedFile.readFully(), Charsets.UTF_8)))
  }

  @Synchronized internal fun saveSelected(values: Map<String, HubRouteEndpoint>) {
    write(selectedFile, HubRouteSelection.encode(values))
  }

  private fun exists(target: AtomicFile): Boolean = target.baseFile.exists() || File(target.baseFile.path + ".bak").exists()

  private fun write(target: AtomicFile, text: String) {
    val bytes = box.seal(text).toByteArray(Charsets.UTF_8)
    val stream = target.startWrite()
    try {
      stream.write(bytes)
      target.finishWrite(stream)
    } catch (failure: Exception) {
      target.failWrite(stream)
      throw failure
    }
  }
}
