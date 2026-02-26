import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from './app';
import { config } from './config';

const PORT = config.port;
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);

const certPath = '/app/certs/server.crt';
const keyPath = '/app/certs/server.key';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Teams Meeting Fetcher backend running on HTTPS port ${PORT}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Dashboard: https://localhost:${PORT}`);
  });
}

// Always start HTTP server (used by CloudFront origin)
http.createServer(app).listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP origin server running on port ${HTTP_PORT}`);
});
