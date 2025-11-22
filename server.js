/********************************************************************
 *  IoT Server + MongoDB + Multi-device + Intervalo Aleatorio (20-900s)
 *  Una sola colección de telemetría → escalable y limpia
 ********************************************************************/

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// 1. TOKENS PERMITIDOS
// ---------------------------------------------------------------
const VALID_TOKENS = new Set([
  "esp32-secret-1234",
  "my-device-token-5678",
  "otro-token-valido-9999",
  "ESP32-SECRET-1234",
  "ESP32-SECRET-5678",
  "ESP32-SECRET-9999",
  // Agrega más cuando quieras
]);

// ---------------------------------------------------------------
// 2. AUTENTICACIÓN POR TOKEN
// ---------------------------------------------------------------
app.use((req, res, next) => {
  const token = req.headers["x-api-key"]?.trim();

  if (!token || !VALID_TOKENS.has(token)) {
    console.warn(`[DENEGADO] Token inválido o ausente desde IP: ${req.ip}`);
    return res.status(403).json({ error: "Forbidden – Token inválido" });
  }

  req.deviceToken = token;
  next();
});

// ---------------------------------------------------------------
// 3. Middleware JSON
// ---------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------
// 4. Modelos de MongoDB
// ---------------------------------------------------------------
mongoose.set("strictQuery", false);

// Dispositivo (uno por ESP32)
const DeviceSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },        // el X-API-KEY
  device_name: { type: String, required: true, unique: true },  // nombre que envía la ESP32
  interval_seconds: { type: Number, default: 60 },             // intervalo actual asignado
  last_seen: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
});

const Device = mongoose.model("Device", DeviceSchema);

// Telemetría (una sola colección para TODOS los dispositivos)
const TelemetrySchema = new mongoose.Schema({
  device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
  device_name: String,                    // redundante pero útil para consultas rápidas
  telemetry: { type: mongoose.Schema.Types.Mixed, required: true }, // cualquier JSON
  timestamp_device: Date,                 // timestamp que envía la ESP32
  timestamp_server: { type: Date, default: Date.now },
  ip: String,
  interval_assigned: Number,              // el intervalo que se le dijo que use
});

TelemetrySchema.index({ device: 1, timestamp_server: -1 }); // para consultas rápidas
TelemetrySchema.index({ timestamp_server: -1 });

const Telemetry = mongoose.model("Telemetry", TelemetrySchema);

// ---------------------------------------------------------------
// 5. Generar intervalo aleatorio entre 20 y 900 segundos
// ---------------------------------------------------------------
function randomInterval() {
  return Math.floor(Math.random() * (900 - 20 + 1)) + 20; // 20 a 900 segundos
}

// ---------------------------------------------------------------
// 6. POST /api/telemetry → recibe datos de cualquier ESP32
// ---------------------------------------------------------------
app.post("/api/telemetry", async (req, res) => {
  const { device_name, timestamp_device, telemetry } = req.body;

  if (!device_name || typeof telemetry !== "object") {
    return res.status(400).json({
      error: "Faltan device_name o telemetry (debe ser objeto JSON)",
    });
  }

  try {
    // Buscar o crear el dispositivo por token + device_name
    let device = await Device.findOne({ token: req.deviceToken });

    if (!device) {
      // Primer registro del dispositivo
      device = new Device({
        token: req.deviceToken,
        device_name,
        interval_seconds: randomInterval(),
      });
      await device.save();
      console.log(`[NUEVO DISPOSITIVO] ${device_name} | Token: ${req.deviceToken}`);
    } else {
      // Actualizar nombre si cambió (por si el usuario lo modifica)
      if (device.device_name !== device_name) {
        device.device_name = device_name;
      }
    }

    // Generar NUEVO intervalo aleatorio para la próxima vez
    const newInterval = randomInterval();
    device.interval_seconds = newInterval;
    device.last_seen = new Date();
    await device.save();

    // Guardar telemetría
    await Telemetry.create({
      device: device._id,
      device_name,
      telemetry,
      timestamp_device: timestamp_device ? new Date(timestamp_device) : null,
      ip: req.ip,
      interval_assigned: newInterval,
    });

    // Respuesta al ESP32
    res.json({
      status: "success",
      server_time: Date.now(),
      device_name,
      next_report_in_seconds: newInterval,   // ← ESTE ES EL VALOR QUE LA ESP32 DEBE USAR
      message: "Datos recibidos y guardados",
    });
  } catch (err) {
    console.error("Error en /api/telemetry:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ---------------------------------------------------------------
// 7. HEALTH + info rápida de dispositivos
// ---------------------------------------------------------------
app.get("/health", async (req, res) => {
  const deviceCount = await Device.countDocuments();
  res.json({
    status: "running",
    version: "3.0.0 – Producción estable (21-nov-2025)",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    registered_devices: deviceCount,
    uptime: process.uptime().toFixed(0) + "s",
  });
});

// ---------------------------------------------------------------
// 8. Iniciar servidor
// ---------------------------------------------------------------
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB conectado correctamente");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor IoT escuchando en puerto ${PORT}`);
      console.log(`Dispositivos registrados serán guardados automáticamente`);
    });
  })
  .catch((err) => {
    console.error("No se pudo conectar a MongoDB:", err);
    process.exit(1);
  });