import { z } from 'zod';
import { isIP } from 'node:net';
import { createPrivateKey } from 'node:crypto';

const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.preprocess(value => value === '' ? undefined : value,
    z.string().url().refine(value => /^postgres(ql)?:\/\//.test(value)).optional()),
  CORS_ORIGINS: z.string().default(''),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  DOCTOR_REGISTRATION_DEFER_DOCUMENTS: z.enum(['true', 'false']).default('false'),
  DOCTOR_CREDENTIAL_STORAGE: z.enum(['disabled', 'local-test']).default('disabled'),
  DOCTOR_CREDENTIAL_ROOT: z.string().default(''),
  DOCTOR_CREDENTIAL_KEY: z.string().default(''),
  DOCTOR_CREDENTIAL_SCANNER: z.string().default(''),
  DOCTOR_REQUIRED_CREDENTIALS: z.string().refine(v => v === '' || v.split(',').every(k => ['QUALIFICATION','REGISTRATION','IDENTITY','ADDITIONAL'].includes(k))).default(''),
  OTP_MODE: z.enum(['disabled', 'development', 'testing', 'provider']).default('disabled'),
  SMS_PROVIDER: z.enum(['disabled', 'twilio']).default('disabled'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_MESSAGING_SERVICE_SID: z.string().default(''),
  SMS_OTP_TEMPLATE: z.string().max(300).default(''),
  EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  PUSH_PROVIDER: z.enum(['disabled', 'fcm']).default('disabled'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().default(''),
  NOTIFICATION_ENCRYPTION_KEY: z.string().default(''),
  PAYMENT_MODE: z.enum(['disabled', 'development']).default('disabled'),
  DEMO_PROGRAMS: z.enum(['true', 'false']).default('false'),
  DEMO_CONSULTATIONS: z.enum(['true', 'false']).default('false'),
  DEMO_WELLNESS: z.enum(['true', 'false']).default('false'),
  ORDER_HOLD_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  ORDER_CANCEL_CONFIRMED: z.enum(['true', 'false']).default('true'),
  CANCELLATION_WINDOW_MINUTES: z.coerce.number().int().min(0).max(10080).default(120),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  SESSION_SECRET: z.string().default(''),
  ADMIN_SECURITY_MODE: z.enum(['disabled', 'development', 'totp']).default('development'),
  ADMIN_TOTP_KEYS: z.string().default('{}'),
  LEGAL_DOCUMENTS: z.string().default('[]'),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  AI_PROVIDER: z.enum(['disabled', 'development', 'openai']).default('disabled'),
  AI_MODEL: z.string().max(100).default(''),
  AI_API_KEY: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(9000).default(8000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(1000).default(256),
  WHATSAPP_MODE: z.enum(['disabled', 'webhook']).default('disabled'),
  WHATSAPP_OUTBOUND: z.enum(['disabled', 'cloud']).default('disabled'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_API_VERSION: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_BUSINESS_ID: z.string().regex(/^\d*$/).default(''),
}).superRefine((env, ctx) => {
  const deployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
  if (env.DOCTOR_REGISTRATION_DEFER_DOCUMENTS === 'true' && (deployed || env.NODE_ENV === 'production')) ctx.addIssue({code:'custom',path:['DOCTOR_REGISTRATION_DEFER_DOCUMENTS'],message:'Document deferral is development/test only'});
  if(env.DOCTOR_CREDENTIAL_STORAGE === 'local-test' && (deployed || !env.DOCTOR_CREDENTIAL_ROOT || !env.DOCTOR_CREDENTIAL_SCANNER || !/^[A-Za-z0-9+/]{43}=$/.test(env.DOCTOR_CREDENTIAL_KEY))) ctx.addIssue({code:'custom',path:['DOCTOR_CREDENTIAL_STORAGE'],message:'Local credential storage requires an isolated development/test root, scanner and encryption key'});
  if (env.EMAIL_PROVIDER === 'resend' && (env.RESEND_API_KEY.length < 16 || !z.email().safeParse(env.EMAIL_FROM).success))
    ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'Configure a verified sender and provider key' });
  if (env.PUSH_PROVIDER === 'fcm') {
    try {
      const account = z.object({ project_id: z.string().regex(/^[a-z][a-z0-9-]{4,62}$/), client_email: z.email().refine(value => value.endsWith('.gserviceaccount.com')), private_key: z.string() }).parse(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON));
      if (createPrivateKey(account.private_key).asymmetricKeyType !== 'rsa') throw new Error();
    } catch { ctx.addIssue({ code: 'custom', path: ['FCM_SERVICE_ACCOUNT_JSON'], message: 'Configure the Firebase service account' }); }
    if (!/^[A-Za-z0-9+/]{43}=$/.test(env.NOTIFICATION_ENCRYPTION_KEY))
      ctx.addIssue({ code: 'custom', path: ['NOTIFICATION_ENCRYPTION_KEY'], message: 'Use a private 32-byte base64 key' });
  }
  if (env.OTP_MODE === 'provider' && (env.SMS_PROVIDER !== 'twilio' || !/^AC[0-9a-fA-F]{32}$/.test(env.TWILIO_ACCOUNT_SID)
    || env.TWILIO_AUTH_TOKEN.length < 32 || !/^MG[0-9a-fA-F]{32}$/.test(env.TWILIO_MESSAGING_SERVICE_SID)
    || env.SMS_OTP_TEMPLATE.split('{code}').length !== 2)) {
    ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'Configure the approved SMS sender and OTP template' });
  }
  for (const value of env.TRUSTED_PROXY_CIDRS.split(',').map(v => v.trim()).filter(Boolean)) {
    const [address, mask, extra] = value.split('/'), family = isIP(address ?? '');
    if (!family || extra !== undefined || (mask !== undefined && (!/^\d+$/.test(mask) || Number(mask) < 1 || Number(mask) > (family === 4 ? 32 : 128)))) {
      ctx.addIssue({ code: 'custom', path: ['TRUSTED_PROXY_CIDRS'], message: 'Use approved proxy IPs or CIDRs, never trust all proxies' });
    }
  }
  if ((env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_SECRET) && (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID) || env.RAZORPAY_KEY_SECRET.length < 16)) {
    ctx.addIssue({ code: 'custom', path: ['RAZORPAY_KEY_ID'], message: 'Configure a matching provider key pair' });
  }
  if (env.RAZORPAY_WEBHOOK_SECRET && env.RAZORPAY_WEBHOOK_SECRET.length < 32) {
    ctx.addIssue({ code: 'custom', path: ['RAZORPAY_WEBHOOK_SECRET'], message: 'Use a strong webhook secret' });
  }
  if (env.WHATSAPP_OUTBOUND === 'cloud' && (env.WHATSAPP_MODE !== 'webhook' || env.WHATSAPP_ACCESS_TOKEN.length < 32 || !/^v\d{2}\.0$/.test(env.WHATSAPP_API_VERSION))) {
    ctx.addIssue({ code: 'custom', path: ['WHATSAPP_OUTBOUND'], message: 'Configure the approved Cloud API version and credentials' });
  }
  if ((deployed || env.NODE_ENV === 'production') && env.ADMIN_SECURITY_MODE === 'development') {
    ctx.addIssue({ code: 'custom', path: ['ADMIN_SECURITY_MODE'], message: 'Configure admin security explicitly' });
  }
  if (deployed && (env.SESSION_SECRET.length < 32 || env.NODE_ENV !== 'production')) {
    ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Use production runtime and a strong session secret' });
  }
  try {
    const keys: unknown = JSON.parse(env.ADMIN_TOTP_KEYS);
    if (!z.record(z.string().uuid(), z.string().regex(/^[A-Z2-7]{32,128}$/)).safeParse(keys).success ||
      (env.ADMIN_SECURITY_MODE === 'totp' && Object.keys(keys as object).length === 0)) throw new Error();
  } catch { ctx.addIssue({ code: 'custom', path: ['ADMIN_TOTP_KEYS'], message: 'Configure per-admin TOTP keys' }); }
  try {
    if (!z.array(z.object({ type: z.string().regex(/^[A-Z_]{2,40}$/), version: z.string().min(1).max(40),
      url: z.url().refine(v => new URL(v).protocol === 'https:'), approved: z.boolean() }).strict()).max(20).safeParse(JSON.parse(env.LEGAL_DOCUMENTS)).success) throw new Error();
  } catch { ctx.addIssue({ code: 'custom', path: ['LEGAL_DOCUMENTS'], message: 'Configure policy metadata' }); }
  if (env.AI_PROVIDER === 'development' && (deployed || env.NODE_ENV === 'production')) {
    ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'Development AI is local only' });
  }
  if (env.AI_PROVIDER === 'openai' && (!env.AI_MODEL || !env.AI_API_KEY)) {
    ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'Configure model and key' });
  }
  if (env.WHATSAPP_MODE === 'webhook' && (env.WHATSAPP_APP_SECRET.length < 32 || env.WHATSAPP_VERIFY_TOKEN.length < 32 || !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID))) {
    ctx.addIssue({ code: 'custom', path: ['WHATSAPP_MODE'], message: 'Configure webhook credentials' });
  }
  if ((env.PAYMENT_MODE === 'development' || env.DEMO_PROGRAMS === 'true' || env.DEMO_CONSULTATIONS === 'true' || env.DEMO_WELLNESS === 'true') && (deployed || env.NODE_ENV === 'production')) {
    ctx.addIssue({ code: 'custom', path: ['PAYMENT_MODE'], message: 'Demo programs and payments are forbidden in deployments' });
  }
  if (env.OTP_MODE === 'development' && (deployed || env.NODE_ENV === 'production')) {
    ctx.addIssue({ code: 'custom', path: ['OTP_MODE'], message: 'Development OTP is forbidden in deployments' });
  }
  if (env.OTP_MODE !== 'disabled' && env.SESSION_SECRET.length < 32) {
    ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'Use at least 32 random characters' });
  }
  if (env.OTP_MODE === 'testing' && !['staging', 'test'].includes(env.APP_ENV)) {
    ctx.addIssue({ code: 'custom', path: ['OTP_MODE'], message: 'Hosted testing OTP requires an isolated staging environment' });
  }
  if (deployed && !env.DATABASE_URL) {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required in deployed environments' });
  }
  if (env.NODE_ENV === 'production' && !deployed) {
    ctx.addIssue({ code: 'custom', path: ['APP_ENV'], message: 'Set staging or production explicitly' });
  }
  for (const origin of env.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean)) {
    try {
      const url = new URL(origin);
      if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (deployed && url.protocol !== 'https:')) throw new Error();
    } catch {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Use exact origins; deployed origins require HTTPS' });
    }
  }
});

export type Environment = z.infer<typeof schema>;

// Only schema-owned variable names belong in this error, never input values.
export class EnvironmentConfigurationError extends Error {
  constructor(fields: readonly (keyof Environment)[]) {
    super(`Invalid environment configuration: ${[...new Set(fields)].join(', ')}`);
    this.name = 'EnvironmentConfigurationError';
  }
}

export function readEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Never echo environment values, credentials or URLs in startup errors.
    throw new EnvironmentConfigurationError(result.error.issues.map(issue => issue.path[0] as keyof Environment));
  }
  return result.data;
}
