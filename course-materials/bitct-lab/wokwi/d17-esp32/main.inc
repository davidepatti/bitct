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
  int failures = 0;
  while (!mqtt.connected()) {
    lcdLine(1, "MQTT...");
    String id = String("d17-") + GROUP + "-" + String((uint32_t)esp_random(), HEX);
    if (mqtt.connect(id.c_str())) {
      Serial.printf("MQTT connected to %s:%d, topic %s\n", MQTT_HOST, MQTT_PORT, topic);
    } else {
      Serial.printf("MQTT connect failed (state %d), retrying\n", mqtt.state());
      if (++failures % 5 == 0) {
        // Seen after the Wokwi tab spent time in the background: a fresh start reconnects at once.
        Serial.println("hint: keep the Wokwi tab in front; if this repeats, restart the simulation");
        lcdLine(1, "MQTT? restart");
      }
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

// Fallback clock: the Date header of a plain HTTP response. Wokwi's virtual Wi-Fi always
// carries TCP (as for MQTT), while NTP over UDP sometimes gets no answer.
static int monthIndex(const char *m) {
  const char *names = "JanFebMarAprMayJunJulAugSepOctNovDec";
  for (int i = 0; i < 12; i++) if (strncmp(m, names + 3 * i, 3) == 0) return i;
  return -1;
}

static long long daysFromCivil(int y, int m, int d) {  // days since 1970-01-01 (proleptic Gregorian)
  y -= m <= 2;
  const long long era = (y >= 0 ? y : y - 399) / 400;
  const int yoe = (int)(y - era * 400);
  const int doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

static time_t httpDateEpoch(const char *host) {
  WiFiClient c;
  if (!c.connect(host, 80)) return 0;
  c.printf("HEAD / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", host);
  unsigned long t0 = millis();
  while (millis() - t0 < 6000 && (c.connected() || c.available())) {
    String line = c.readStringUntil('\n');
    if (line.length() == 0) continue;
    if (line.startsWith("Date: ") || line.startsWith("date: ")) {
      char wd[4], mon[4];
      int d, y, hh, mm, ss;
      if (sscanf(line.c_str() + 6, "%3s, %d %3s %d %d:%d:%d", wd, &d, mon, &y, &hh, &mm, &ss) == 7) {
        int mi = monthIndex(mon);
        if (mi >= 0) return (time_t)(daysFromCivil(y, mi + 1, d) * 86400LL + hh * 3600L + mm * 60L + ss);
      }
    }
  }
  return 0;
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
  {  // maintainers: compare with the Python reference (README, "Verification")
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
  lcdLine(1, "Clock...");
  time_t now = 0;
  const char *clk = "";
#ifndef D17_SKIP_NTP
  for (int i = 0; i < 150 && now < 1700000000; i++) { delay(100); time(&now); }
#endif
  if (now < 1700000000) { clk = ", HTTP Date header"; now = httpDateEpoch("www.google.com"); }
  if (now < 1700000000) now = httpDateEpoch("example.com");
  if (now >= 1700000000) {
    seq = (uint64_t)now;
    Serial.printf("first sequence number (boot time%s): %llu\n", clk, (unsigned long long)seq);
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
