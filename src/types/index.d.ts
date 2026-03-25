import { Application, RequestHandler } from "express";
import { Server } from "http";

export interface CorsOptions {
  origin?: string | string[] | RegExp;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
}

export interface RateLimitWindow {
  windowMs?: number;
  max?: number;
}

export interface SlowdownOptions {
  windowMs?: number;
  delayAfter?: number;
  delayMs?: number;
}

export interface RateLimitOptions {
  global?: RateLimitWindow;
  auth?: RateLimitWindow;
  slowdown?: SlowdownOptions;
}

export interface CsrfOptions {
  enabled?: boolean;
  headerName?: string;
  cookieName?: string;
  secret?: string;
}

export interface RedisOptions {
  enabled?: boolean;
  url?: string;
  host?: string;
  port?: number;
}

export interface AuthPoolOptions {
  /** MongoDB connection string */
  mongoURI?: string;
  /** Google OAuth client ID */
  googleClientID?: string;
  /** Google OAuth client secret */
  googleClientSecret?: string;
  /** Google OAuth callback URL */
  googleCallbackURL?: string;
  /** Secret used to sign JWT access and refresh tokens */
  jwtSecret?: string;
  /** Secret used to sign the session cookie */
  sessionSecret?: string;
  /** Port the server listens on (default: 5000) */
  port?: number;
  /** CORS configuration */
  corsOptions?: CorsOptions;
  /** Rate limiting thresholds */
  rateLimit?: RateLimitOptions;
  /** CSRF protection options */
  csrf?: CsrfOptions;
  /** Redis options for brute-force tracking and rate limiting */
  redis?: RedisOptions;
  /**
   * Hook to transform an OAuth profile before saving to MongoDB.
   * Return a plain object with at least one of: a provider id (e.g. `googleId`) or `email`.
   */
  transformUser?: (profile: any, provider: "google") => Record<string, any>;
  /**
   * Called after the server starts listening.
   * Use this to add custom routes or middleware.
   */
  onReady?: (app: Application, server: Server) => void;
}

export interface AuthPoolServer {
  app: Application;
  server: Server;
}

/**
 * Start the AuthPool authentication server.
 */
export function startAuthServer(options?: AuthPoolOptions): Promise<AuthPoolServer>;