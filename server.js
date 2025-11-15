/********************************************************************
 *  server.js  –  Express protegido SOLO con token (X-API-KEY)
 *  Integrado con MongoDB usando Mongoose
 ********************************************************************/

require('dotenv').config(); // Carga variables de entorno desde .env

const express = require('express');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// 1. WHITELIST DE TOKENS (único método de autorización)
// ---------------------------------------------------------------
const VALID_TOKENS = new Set([
  'esp32-secret-1234',
  'my-device-token-5678',
  'otro-token-valido-9999',
  // Añade aquí todos los tokens que quieras permitir
]);

// ---------------------------------------------------------------
// 2. MIDDLEWARE DE AUTORIZACIÓN POR TOKEN
// ---------------------------------------------------------------
app.use((req, res, next) => {
  const token = req.headers['x-api-key'];

  if (!token || !VALID_TOKENS.has(token)) {
    console.warn(
      `${new Date().toISOString()} - ACCESO DENEGADO - Token: ${token || 'ninguno'} - IP: ${
        req.ip
      }`
    );
    return res
      .status(403)
      .json({ error: 'Forbidden – Token inválido o ausente' });
  }

  // Token válido → log y continuar
  console.log(
    `${new Date().toISOString()} - ${req.method} ${req.path} - Token: ${token} - IP: ${req.ip}`
  );

  next();
});

// ---------------------------------------------------------------
// 3. Middleware para parsear JSON
// ---------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------
// 4. Configuración de MongoDB
// ---------------------------------------------------------------
mongoose.set('strictQuery', false);

// Esquemas y Modelos
const sensorSchema = new mongoose.Schema({
  data: { type: Object, required: true },
  received_at: { type: Date, default: Date.now }
});

const deviceSchema = new mongoose.Schema({
  device_id: { type: Number, required: true, unique: true },
  state: { type: Object, required: true },
  updated_at: { type: Date, default: Date.now }
});

const Sensor = mongoose.model('Sensor', sensorSchema);
const Device = mongoose.model('Device', deviceSchema);

// Función asíncrona para conectar a MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB exitosamente');
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
    process.exit(1); // Salir si falla la conexión
  }
}

// ---------------------------------------------------------------
// 5. RUTAS
// ---------------------------------------------------------------
app.get('/health', (req, res) => {
  const ts = new Date().toISOString();
  res.json({
    status: 'success',
    received_at: ts,
    message: 'Servidor healthy – actualización confirmada',
    db_status: mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'
  });
});

app.post('/api/sensor', async (req, res) => {
  const ts = new Date().toISOString();
  console.log('Sensor data:', req.body);

  try {
    const newSensorData = new Sensor({ data: req.body });
    await newSensorData.save();
    res.json({
      status: 'success',
      received_at: ts,
      message: 'Datos de sensor guardados en MongoDB',
      processed_data: req.body,
      mongo_id: newSensorData._id
    });
  } catch (error) {
    console.error('Error al guardar en MongoDB:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al guardar datos de sensor en la base de datos'
    });
  }
});

app.put('/api/device/1', async (req, res) => {
  const ts = new Date().toISOString();
  console.log('Device update:', req.body);

  try {
    const updatedDevice = await Device.findOneAndUpdate(
      { device_id: 1 },
      { state: req.body, updated_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({
      status: 'success',
      received_at: ts,
      message: 'Estado del dispositivo actualizado en MongoDB',
      updated: req.body,
      mongo_id: updatedDevice._id
    });
  } catch (error) {
    console.error('Error al actualizar en MongoDB:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al actualizar el dispositivo en la base de datos'
    });
  }
});

// ---------------------------------------------------------------
// 6. 404
// ---------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ---------------------------------------------------------------
// 7. INICIO DEL SERVIDOR (después de conectar a DB)
// ---------------------------------------------------------------
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en ${PORT}`);
    console.log('Autorización: SOLO token en header X-API-KEY');
    console.log('Tokens válidos:', Array.from(VALID_TOKENS));
  });
}

startServer();