import https from 'https';
import fs from 'fs';
import path from 'path';
import app from './app';
import { config } from './config';
import { transcriptPoller } from './services/transcriptPoller';

const PORT = config.port;

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
    transcriptPoller.start();
  });
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Teams Meeting Fetcher backend running on HTTP port ${PORT}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`WARNING: No TLS certs found, running without HTTPS`);
    transcriptPoller.start();
  });
}
