// ===========================================================================
// D17 — a simulated factory electricity meter that signs every reading.
// Course "Blockchain for Decentralized Security in IoT" — Docker lab DLAB 11.
//
// Every REPORT_INTERVAL_MS the ESP32:
//   1. reads the "current sensor" (the slide potentiometer) and converts it to watts;
//   2. writes the exact D17 report bytes (schema, device, key, enrollment, seq, …);
//   3. signs m = TaggedHash(schema, bytes) with BIP340 Schnorr (secp256k1);
//   4. publishes {"report", "sig", "pub"} over MQTT to bitct/<GROUP>/d17/report.
// The lab's Docker gateway verifies, batches and anchors the readings on Bitcoin.
//
// Buttons: REPLAY re-sends the last message unchanged; TAMPER changes the value
// after signing. Watch how the gateway classifies both.
// ===========================================================================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include "esp_random.h"

#define POT_PIN 34
#define LED_PIN 2
#define BTN_REPLAY 4
#define BTN_TAMPER 5
#define MAX_WATTS 3000

LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient net;
PubSubClient mqtt(net);

uint8_t seckey[32], pubkey[32];
char pubhex[65];
char topic[96];
uint64_t seq = 1;
String lastMsg, lastReport;
int lastWatts = 0;
unsigned long lastSend = 0;
int prevReplay = HIGH, prevTamper = HIGH;  // buttons act once per press

static void rng(void *buf, size_t len) { esp_fill_random(buf, len); }

static void lcdLine(int row, const String &s) {
  String t = s;
  while (t.length() < 16) t += ' ';
  lcd.setCursor(0, row);
  lcd.print(t.substring(0, 16));
}

static String jsonEscape(const String &s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '\n') o += "\\n";
    else if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else o += c;
  }
  return o;
}

static String buildReport(uint64_t s, int watts) {
  String r = "course.factory-telemetry.v1\n";
  r += "device=" DEVICE_ID "\n";
  r += "key=" KEY_ID "\n";
  r += "enrollment=" + String(ENROLLMENT) + "\n";
  r += "seq=" + String((unsigned long long)s) + "\n";
  r += "quantity=active-power\n";
  r += "value=" + String(watts) + "\n";
  r += "unit=W\n";
  r += "audience=" AUDIENCE;
  return r;
}

static String signReport(const String &report, unsigned long *ms) {
  uint8_t m[32], aux[32], sig[64];
  char sighex[129];
  unsigned long t0 = millis();
  bip340_tagged_hash("course.factory-telemetry.v1", (const uint8_t *)report.c_str(), report.length(), m);
  esp_fill_random(aux, sizeof aux);
  if (bip340_sign(seckey, m, aux, sig) != 0) return "";
  *ms = millis() - t0;
  bip340_hex(sig, 64, sighex);
  return String(sighex);
}

static void connectWiFi() {
  lcdLine(1, "WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
  while (WiFi.status() != WL_CONNECTED) delay(100);
  Serial.printf("WiFi connected, IP %s\n", WiFi.localIP().toString().c_str());
}

static void connectMQTT() {
  while (!mqtt.connected()) {
    lcdLine(1, "MQTT...");
    String id = String("d17-") + GROUP + "-" + String((uint32_t)esp_random(), HEX);
    if (mqtt.connect(id.c_str())) {
      Serial.printf("MQTT connected to %s:%d, topic %s\n", MQTT_HOST, MQTT_PORT, topic);
    } else {
      Serial.printf("MQTT connect failed (state %d), retrying\n", mqtt.state());
      delay(2000);
    }
  }
}

static void publish(const String &msg, const char *what) {
  bool ok = mqtt.publish(topic, msg.c_str());
  digitalWrite(LED_PIN, HIGH);
  Serial.printf("published %s (%u bytes): %s\n", what, msg.length(), ok ? "OK" : "FAILED");
  delay(80);
  digitalWrite(LED_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BTN_REPLAY, INPUT_PULLUP);
  pinMode(BTN_TAMPER, INPUT_PULLUP);
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcdLine(0, "D17 meter boot");

  bip340_set_rng(rng);
  if (bip340_unhex(DEVICE_SECRET_HEX, seckey, 32) != 0 || bip340_pubkey(seckey, pubkey) != 0) {
    Serial.println("ERROR: DEVICE_SECRET_HEX must be 64 hex characters (run 'd17 keygen')");
    lcdLine(1, "bad secret key");
    while (true) delay(1000);
  }
  bip340_hex(pubkey, 32, pubhex);
#ifdef D17_SELFTEST
  {  // maintainers: compare with the Python reference (tests/selftest_esp32.sh)
    String r = buildReport(42, 1200);
    uint8_t m[32], aux[32] = {0}, sig[64];
    char hx[129];
    bip340_tagged_hash("course.factory-telemetry.v1", (const uint8_t *)r.c_str(), r.length(), m);
    unsigned long t0 = millis();
    bip340_sign(seckey, m, aux, sig);
    bip340_hex(sig, 64, hx);
    Serial.printf("SELFTEST pub %s\nSELFTEST sig %s\nSELFTEST ms %lu\n", pubhex, hx, millis() - t0);
    while (true) delay(1000);
  }
#endif
  snprintf(topic, sizeof topic, "bitct/%s/d17/report", GROUP);

  Serial.println();
  Serial.println("=== D17 signed meter ===");
  Serial.printf("device %s, key %s, enrollment %d\n", DEVICE_ID, KEY_ID, ENROLLMENT);
  Serial.printf("public key (x-only) for enrollment:\n%s\n", pubhex);

  connectWiFi();
  // Wokwi does not keep flash between runs, so the counter starts from the
  // boot time (seconds since 1970). It still increases across restarts.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  lcdLine(1, "NTP time...");
  time_t now = 0;
  for (int i = 0; i < 100 && now < 1700000000; i++) { delay(100); time(&now); }
  if (now >= 1700000000) {
    seq = (uint64_t)now;
    Serial.printf("first sequence number (boot time): %llu\n", (unsigned long long)seq);
  } else {
    Serial.println("WARNING: no network time; counter restarts at 1 (expect NO_NEW_EVENT)");
  }
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
  connectMQTT();
  lastSend = millis() - REPORT_INTERVAL_MS + 2000;
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  if (millis() - lastSend >= REPORT_INTERVAL_MS) {
    lastSend = millis();
    int raw = analogRead(POT_PIN);
    int watts = (int)((long)raw * MAX_WATTS / 4095);
    String report = buildReport(seq, watts);
    unsigned long ms = 0;
    String sig = signReport(report, &ms);
    if (sig.length() == 128) {
      String msg = String("{\"v\":1,\"report\":\"") + jsonEscape(report) + "\",\"sig\":\"" + sig +
                   "\",\"pub\":\"" + pubhex + "\"}";
      Serial.println("--- report bytes ---");
      Serial.println(report);
      Serial.printf("--- BIP340 signature (%lu ms) ---\n%s\n", ms, sig.c_str());
      publish(msg, "reading");
      lcdLine(0, "D17 " + String(watts) + " W");
      String s = String((unsigned long long)seq);
      lcdLine(1, "seq .." + s.substring(s.length() > 6 ? s.length() - 6 : 0) + " OK");
      lastMsg = msg;
      lastReport = report;
      lastWatts = watts;
      seq++;
    }
  }

  int replay = digitalRead(BTN_REPLAY), tamper = digitalRead(BTN_TAMPER);
  if (replay == LOW && prevReplay == HIGH && lastMsg.length()) {
    publish(lastMsg, "REPLAY of the last message");
    lcdLine(1, "REPLAY sent");
    delay(400);
  }
  if (tamper == LOW && prevTamper == HIGH && lastMsg.length()) {
    String forged = lastMsg;
    forged.replace("value=" + String(lastWatts) + "\\n", "value=" + String(lastWatts + 1000) + "\\n");
    publish(forged, "TAMPERED copy (value +1000 W, old signature)");
    lcdLine(1, "TAMPER sent");
    delay(400);
  }
  prevReplay = replay;
  prevTamper = tamper;
  delay(10);
}
