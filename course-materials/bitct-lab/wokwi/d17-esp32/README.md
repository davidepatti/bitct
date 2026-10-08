# D17 signed meter — Wokwi ESP32 project (DLAB 11)

A simulated factory electricity meter: an ESP32 reads a "current sensor" (the slide
potentiometer stands in for a current-transformer clamp), turns it into watts, writes the
exact D17 report bytes, signs them with **BIP340 Schnorr** (secp256k1, the curve used by
Bitcoin) and publishes the result over MQTT. The lab's Docker gateway verifies, batches and
anchors the readings on Bitcoin.

| File | Purpose |
|---|---|
| `sketch.ino` | the single file students paste into Wokwi (configuration block at the top) |
| `diagram.json` | ESP32 DevKit-C v4, slide potentiometer on GPIO34, 16×2 I²C LCD, LED, REPLAY and TAMPER buttons |
| `libraries.txt` | `PubSubClient`, `LiquidCrystal I2C` |
| `config.inc`, `bip340.h`, `bip340.cpp`, `main.inc` | maintainer sources; `python3 make_sketch.py` rebuilds `sketch.ino` |

## Wiring

| Part | ESP32 pin |
|---|---|
| slide potentiometer SIG / VCC / GND | 34 / 3V3 / GND |
| LCD 1602 (I²C, 0x27) SDA / SCL / VCC / GND | 21 / 22 / 5V / GND |
| LED (with 220 Ω) | 2 |
| REPLAY button | 4 (to GND, internal pull-up) |
| TAMPER button | 5 (to GND, internal pull-up) |

## Message on the wire

Topic `bitct/<GROUP>/d17/report`, payload:

```json
{"v":1,"report":"course.factory-telemetry.v1\ndevice=D17\nkey=key-A\nenrollment=1\nseq=1791386815\nquantity=active-power\nvalue=1301\nunit=W\naudience=factory-a.audit","sig":"<64-byte BIP340 signature, hex>","pub":"<x-only key, hex — diagnostic only>"}
```

The signed message is `m = TaggedHash("course.factory-telemetry.v1", exact report bytes)`.
The gateway never re-serializes the report and never trusts the `pub` field: it verifies with
the key the operator enrolled.

## Verification done by the maintainers

* `hosttest/test_bip340.cpp` compiles `bip340.cpp` against mbedTLS 3.6 and reproduces BIP340
  test vectors 0–3 and the Python reference signature of report R42.
* The sketch compiles with arduino-esp32 **3.3.9** (mbedTLS 3.6.5, secp256k1 enabled).
* Built with `-DD17_SELFTEST`, the firmware runs in Espressif QEMU and prints the same R42
  signature as the Python reference (hardware SHA/MPI accelerators in use).

## Known simulator limits

* Wokwi keeps no flash between runs, so the sequence counter starts from the boot time
  (NTP seconds) and increases by one per report. It stays increasing across restarts; the
  gateway sees a gap, which the lab discusses. A real meter keeps its counter in protected storage.
* The free Wokwi gateway reaches the Internet, not your laptop: hence the public MQTT broker.
* The secret key is pasted into the sketch: acceptable only for a lab. A real device generates
  it inside a secure element and never exposes it.
