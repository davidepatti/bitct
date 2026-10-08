// ---------------------------------------------------------------------------
// CONFIGURATION — edit these lines before pressing ▶ in Wokwi
// ---------------------------------------------------------------------------
// GROUP must match GROUP in the lab's .env file (letters, digits, '-').
#define GROUP "g00-change-me"

// Device secret key (lab only!). In the lab shell run:  d17 keygen
// and paste the 64-character secret here. A real meter would generate its key
// inside a secure element and never reveal it.
#define DEVICE_SECRET_HEX "0000000000000000000000000000000000000000000000000000000000000000"

#define DEVICE_ID "D17"
#define KEY_ID "key-A"
#define ENROLLMENT 1
#define AUDIENCE "factory-a.audit"
#define REPORT_INTERVAL_MS 15000

// Network: Wokwi's virtual Wi-Fi reaches the Internet, not your laptop,
// so the meter publishes to a public MQTT broker and the lab subscribes to it.
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASS ""
#define MQTT_HOST "broker.hivemq.com"
#define MQTT_PORT 1883
// ---------------------------------------------------------------------------
