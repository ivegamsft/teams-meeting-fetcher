jest.mock('../../../src/config', () => ({
  config: {
    webhook: { authSecret: 'test-webhook-secret' },
    auth: { apiKey: 'test-api-key' },
  },
}));

import { Request, Response, NextFunction } from 'express';
import { webhookAuth, dashboardAuth, optionalAuth } from '../../../src/middleware/auth';

function mockRequest(overrides: Record<string, any> = {}): Request {
  return {
    headers: {},
    path: '/api/test',
    isAuthenticated: jest.fn(() => false),
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('webhookAuth', () => {
  test('passes with valid bearer token', () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer test-webhook-secret' },
    });
    const res = mockResponse();
    const next = jest.fn();

    webhookAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects missing authorization header', () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = jest.fn();

    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects non-Bearer authorization', () => {
    const req = mockRequest({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    const res = mockResponse();
    const next = jest.fn();

    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects invalid token', () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = mockResponse();
    const next = jest.fn();

    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passes when no auth secret configured', () => {
    const configMod = require('../../../src/config');
    const origSecret = configMod.config.webhook.authSecret;
    configMod.config.webhook.authSecret = '';

    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = jest.fn();

    webhookAuth(req, res, next);
    expect(next).toHaveBeenCalled();

    configMod.config.webhook.authSecret = origSecret;
  });
});

describe('dashboardAuth', () => {
  test('passes for /api/auth/status path', () => {
    const req = mockRequest({ path: '/api/auth/status' });
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes for /health path', () => {
    const req = mockRequest({ path: '/health' });
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes with valid API key', () => {
    const req = mockRequest({
      headers: { 'x-api-key': 'test-api-key' },
    });
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes with authenticated Entra session', () => {
    const req = mockRequest({
      isAuthenticated: jest.fn(() => true),
    });
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects unauthenticated requests', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid API key', () => {
    const req = mockRequest({
      headers: { 'x-api-key': 'wrong-key' },
    });
    const res = mockResponse();
    const next = jest.fn();

    dashboardAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('optionalAuth', () => {
  test('sets authenticated flag with valid API key', () => {
    const req = mockRequest({
      headers: { 'x-api-key': 'test-api-key' },
    });
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req, res, next);
    expect((req as any).authenticated).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('sets authenticated flag with Entra session', () => {
    const req = mockRequest({
      isAuthenticated: jest.fn(() => true),
    });
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req, res, next);
    expect((req as any).authenticated).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('proceeds without authentication flag', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req, res, next);
    expect((req as any).authenticated).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  test('always calls next', () => {
    const req = mockRequest({
      headers: { 'x-api-key': 'wrong-key' },
    });
    const res = mockResponse();
    const next = jest.fn();

    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
