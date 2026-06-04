/*
 * Smart Irrigation — ESP32 client for the Node backend in this repo.
 *
 *   GET  /api/status  → read pumpOn, drive GPIO26
 *   POST /api/sensor  → { sensorRaw } only (pump is changed by the app via POST /api/pump)
 *
 * Pump: server is source of truth. Poll pump every PUMP_POLL_MS; post sensor every SENSOR_CYCLE_MS.
 * GPIO26: see PUMP_ACTIVE_LOW and INVERT_RELAY_VS_SERVER below.
 *
 * Libraries: ArduinoJson v7.x, WiFi, HTTPClient (ESP32 board package).
 */

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

// ----- Wi-Fi (edit) -----
static const char* WIFI_SSID = "hope and jenner";
static const char* WIFI_PASSWORD = "byhl6628";

// ----- Backend (LAN IP of PC running `npm start` in /backend) -----
static const char* BACKEND_HOST = "10.60.14.100";
static const uint16_t BACKEND_PORT = 5000;
static const char* API_DEVICE_KEY = "change-me";  // same as ESP32_API_KEY in backend/.env

// ----- Hardware -----
static const int SENSOR_PIN = 34;
static const int RELAY_PIN = 26;
static const bool PUMP_ACTIVE_LOW = true;  // false if your relay module energizes on HIGH
// true: server pumpOn=true was driving the relay the wrong way; flip so app ON = pump ON
static const bool INVERT_RELAY_VS_SERVER = true;

static const unsigned long PUMP_POLL_MS = 400;      // how often to read pumpOn from server
static const unsigned long SENSOR_CYCLE_MS = 1500;  // how often to POST sensorRaw

static WiFiClient wifiClient;
static unsigned long lastPumpPollMs = 0;
static unsigned long lastSensorMs = 0;
static bool lastServerPumpOn = false;
static bool relayInitialized = false;

static void applyRelayFromPumpOn(bool pumpOn) {
  const bool relayEnergized = INVERT_RELAY_VS_SERVER ? !pumpOn : pumpOn;
  const int level =
      PUMP_ACTIVE_LOW ? (relayEnergized ? LOW : HIGH) : (relayEnergized ? HIGH : LOW);
  digitalWrite(RELAY_PIN, level);
}

static bool parseJsonPumpOn(JsonVariant v, bool* out) {
  if (v.isNull() || out == nullptr) {
    return false;
  }
  if (v.is<bool>()) {
    *out = v.as<bool>();
    return true;
  }
  if (v.is<int>() || v.is<long>()) {
    *out = v.as<int>() != 0;
    return true;
  }
  if (v.is<const char*>()) {
    const char* s = v.as<const char*>();
    *out = (strcmp(s, "true") == 0 || strcmp(s, "1") == 0 || strcmp(s, "on") == 0);
    return true;
  }
  *out = v.as<bool>();
  return true;
}

static bool getPumpFromServer(bool* pumpOnOut) {
  if (pumpOnOut == nullptr) {
    return false;
  }

  HTTPClient http;
  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + "/api/status";
  if (!http.begin(wifiClient, url)) {
    Serial.println("GET /api/status: http.begin failed");
    return false;
  }
  http.setTimeout(8000);

  const int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("GET /api/status failed HTTP %d\n", code);
    http.end();
    return false;
  }

  const String payload = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, payload)) {
    Serial.println("GET /api/status: JSON parse error");
    return false;
  }

  if (!parseJsonPumpOn(doc["pumpOn"], pumpOnOut)) {
    Serial.println("GET /api/status: missing pumpOn in response");
    return false;
  }
  return true;
}

static bool postSensorToServer(int sensorRaw) {
  HTTPClient http;
  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + "/api/sensor";
  if (!http.begin(wifiClient, url)) {
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", API_DEVICE_KEY);
  http.setTimeout(8000);

  JsonDocument body;
  body["sensorRaw"] = sensorRaw;
  String json;
  serializeJson(body, json);

  const int code = http.POST(json);
  http.end();
  return code == HTTP_CODE_OK || code == 201;
}

static void pollPumpFromServer() {
  bool serverPumpOn = false;
  if (!getPumpFromServer(&serverPumpOn)) {
    return;
  }

  if (!relayInitialized || serverPumpOn != lastServerPumpOn) {
    applyRelayFromPumpOn(serverPumpOn);
    lastServerPumpOn = serverPumpOn;
    relayInitialized = true;
    Serial.printf("Relay -> pump %s (GPIO26=%s)\n", serverPumpOn ? "ON" : "OFF",
                  digitalRead(RELAY_PIN) == LOW ? "LOW" : "HIGH");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  applyRelayFromPumpOn(false);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Wi-Fi OK, IP: ");
  Serial.println(WiFi.localIP());
  Serial.printf("Backend http://%s:%u — pump poll %lums, sensor %lums\n", BACKEND_HOST, BACKEND_PORT,
                PUMP_POLL_MS, SENSOR_CYCLE_MS);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi lost, reconnecting...");
    WiFi.reconnect();
    delay(500);
    return;
  }

  const unsigned long now = millis();

  if (now - lastPumpPollMs >= PUMP_POLL_MS) {
    lastPumpPollMs = now;
    pollPumpFromServer();
  }

  if (now - lastSensorMs >= SENSOR_CYCLE_MS) {
    lastSensorMs = now;
    const int sensorRaw = analogRead(SENSOR_PIN);
    if (!postSensorToServer(sensorRaw)) {
      Serial.println("POST /api/sensor failed (check x-device-key)");
    } else {
      Serial.printf("Sensor OK ADC=%d  serverPumpOn=%s\n", sensorRaw, lastServerPumpOn ? "true" : "false");
    }
  }

  delay(5);
}
