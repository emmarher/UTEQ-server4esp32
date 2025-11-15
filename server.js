/********************************************************************
 *  IoT Server + MongoDB + Multi-device + Intervalo Aleatorio
 *  Protección por token, telemetría universal, auto-registro
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
]);

// ---------------------------------------------------------------
// 2. AUTENTICACIÓN POR TOKEN
// ---------------------------------------------------------------
app.use((req, res, next) => {
  const token = req.headers["x-api-key"];

  if (!token || !VALID_TOKENS.has(token)) {
    console.warn(`[DENEGADO] Token inválido: ${token || "ninguno"}`);
    return res.status(403).json({ error: "Forbidden" });
  }

  req.deviceToken = token;
  console.log(`[OK] ${req.method} ${req.path} Token=${token}`);
  next();
});

// ---------------------------------------------------------------
// 3. JSON
// ---------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------
// 4. MONGO MODELOS
// ---------------------------------------------------------------
mongoose.set("strictQuery", false);

const DeviceSchema = new mongoose.Schema({
  device_name: { type: String, unique: true },
  interval_seconds: { type: Number, default: 60 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const Device = mongoose.model("Device", DeviceSchema);

// ---------------------------------------------------------------
// 5. FUNCION PARA GENERAR INTERVALO ALEATORIO
// ---------------------------------------------------------------
function randomInterval() {
  return Math.floor(Math.random() * (200 - 20 + 1)) + 20; // 20 - 200 seg
}

// ---------------------------------------------------------------
// 6. ENDPOINT → Recibir telemetría universal
// ---------------------------------------------------------------
app.post("/api/telemetry", async (req, res) => {
  const { device_name, timestamp_device, telemetry } = req.body;

  if (!device_name || !telemetry)
    return res.status(400).json({ error: "device_name y telemetry requeridos" });

  // Obtener o crear dispositivo
  let device = await Device.findOne({ device_name });
  if (!device) {
    device = new Device({ device_name });
    await device.save();
    console.log(`[NEW DEVICE] ${device_name} registrado`);
  }

  // Generar un nuevo intervalo aleatorio para este dispositivo
  const newInterval = randomInterval();
  device.interval_seconds = newInterval;
  device.updated_at = Date.now();
  await device.save();

  // Crear colección dinámica por dispositivo
  const collectionName = `telemetry_${device_name}`;
  const Telemetry = mongoose.model(
    collectionName,
    new mongoose.Schema({}, { strict: false }),
    collectionName
  );

  // Guardar telemetría
  await Telemetry.create({
    telemetry,
    timestamp_device,
    timestamp_server: Date.now(),
    ip: req.ip,
    token: req.deviceToken,
    interval_assigned: newInterval,
  });

  res.json({
    status: "success",
    device: device_name,
    server_time: Date.now(),
    interval_seconds: newInterval,   // SE ENVÍA EL INTERVALO ALEATORIO
  });
});

// ---------------------------------------------------------------
// 7. HEALTH
// ---------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "running",
    version: "2.5.0-viernes-14-nov-2025",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ---------------------------------------------------------------
// 8. START SERVER
// ---------------------------------------------------------------
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB conectado");
    app.listen(PORT, () =>
      console.log(`Servidor IoT en puerto ${PORT}`)
    );
  })
  .catch((err) => console.error("Error en Mongo:", err));
