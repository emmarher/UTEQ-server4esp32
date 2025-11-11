/********************************************************************
 *  server.js  –  Express protegido SOLO con token (X-API-KEY)
 ********************************************************************/

const express = require('express');
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
// 4. RUTAS
// ---------------------------------------------------------------
app.get('/health', (req, res) => {
  const ts = new Date().toISOString();
  res.json({
    status: 'success',
    received_at: ts,
    message: 'Servidor healthy – actualización confirmada',
  });
});

app.post('/api/sensor', (req, res) => {
  const ts = new Date().toISOString();
  console.log('Sensor data:', req.body);
  res.json({
    status: 'success',
    received_at: ts,
    message: 'Datos de sensor actualizados',
    processed_data: req.body,
  });
});

app.put('/api/device/1', (req, res) => {
  const ts = new Date().toISOString();
  console.log('Device update:', req.body);
  res.json({
    status: 'success',
    received_at: ts,
    message: 'Estado del dispositivo actualizado',
    updated: req.body,
  });
});

// ---------------------------------------------------------------
// 5. 404
// ---------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ---------------------------------------------------------------
// 6. INICIO DEL SERVIDOR
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en ${PORT}`);
  console.log('Autorización: SOLO token en header X-API-KEY');
  console.log('Tokens válidos:', Array.from(VALID_TOKENS));
});