import app from './app';
import { config } from './config';

const PORT = config.port;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Teams Meeting Fetcher backend running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
