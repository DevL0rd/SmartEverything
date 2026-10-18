package expo.modules.healthconnect.network

import org.json.JSONObject

internal object HubRouteSelection {
  fun encode(values: Map<String, HubRouteEndpoint>): String {
    val output = JSONObject()
    values.forEach { (canonical, endpoint) -> output.put(canonical, endpoint.toJson()) }
    return output.toString()
  }

  fun decode(text: String): Map<String, HubRouteEndpoint> {
    val input = JSONObject(text)
    return input.keys().asSequence().associateWith {
      val endpoint = input.getJSONObject(it)
      HubRouteEndpoint(endpoint.getString("url"), endpoint.getString("kind"))
    }
  }
}
