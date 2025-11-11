# Node version
Node 20.18.3

# Test commands
## 1. Token correcto
curl -H "X-API-KEY: esp32-secret-1234" http://localhost:3000/health

## 2. Token incorrecto
curl -H "X-API-KEY: wrong-token" http://localhost:3000/health
### → 403 Forbidden

## 3. Sin token
curl http://localhost:3000/health
### → 403 Forbidden