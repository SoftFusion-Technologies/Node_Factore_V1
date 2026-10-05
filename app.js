/* Benjamin Orellana - 05/10/2026 - Aplicación HTTP de Factor E. */
import express from 'express';
import GetRoutes from './src/Routes/index.js';
import { initRelaciones } from './src/Models/relaciones.js';
import { configServidor } from './src/Services/Sistema/configServidor.service.js';
import { cabecerasHttp, corsHttp, rutaNoEncontrada, erroresHttp } from './src/Middlewares/http.js';

export function crearApp() {
  const config = configServidor();
  initRelaciones();
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('strict routing');
  app.enable('case sensitive routing');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.use(cabecerasHttp);
  app.use(corsHttp);
  // Cada archivo define su path completo /api/... y su cadena de autenticación.
  // El JSON se lee después de autorizar la petición. Multipart conserva el stream.
  app.use(GetRoutes);
  app.use(rutaNoEncontrada);
  app.use(erroresHttp);
  return app;
}

export default crearApp();
