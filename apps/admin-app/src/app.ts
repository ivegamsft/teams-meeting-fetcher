import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import passport from 'passport';
import path from 'path';
import { config } from './config';
import apiRoutes from './routes';
import authRoutes from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { initializeEntraAuth } from './middleware/entraAuth';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: config.auth.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

initializeEntraAuth();
app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);

app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  },
}));

app.use('/api', apiRoutes);

app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
    return;
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

export default app;
