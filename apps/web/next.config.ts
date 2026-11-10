import type { NextConfig } from 'next';
import { parseEnv, publicEnvSchema } from '@mp/validation';

// Fail fast at dev start and build time with a readable list of missing variables.
parseEnv(publicEnvSchema, process.env, 'web');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const config: NextConfig = {
  transpilePackages: ['@mp/ui', '@mp/types', '@mp/validation', '@mp/api-client', '@mp/web-auth'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default config;
