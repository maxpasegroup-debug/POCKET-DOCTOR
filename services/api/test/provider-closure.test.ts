import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { registerWhatsAppWebhook, type WhatsAppService } from '../src/modules/assistant/whatsapp.js';
import { readEnvironment } from '../src/config/env.js';
import { TwilioSmsProvider } from '../src/modules/auth/sms-provider.js';
import { ResendEmailProvider, FcmPushProvider, publicNotification } from '../src/modules/notifications/channel-providers.js';
import { RazorpayProvider } from '../src/modules/payments/razorpay.js';

// Ephemeral contract-test fixtures; transports below never contact providers.
const smsConfig = () => readEnvironment({ OTP_MODE: 'provider', SMS_PROVIDER: 'twilio', SESSION_SECRET: randomBytes(32).toString('hex'),
  TWILIO_ACCOUNT_SID: 'AC' + randomBytes(16).toString('hex'), TWILIO_AUTH_TOKEN: randomBytes(32).toString('hex'), TWILIO_MESSAGING_SERVICE_SID: 'MG' + randomBytes(16).toString('hex'), SMS_OTP_TEMPLATE: 'Pocket Doctor test code: {code}' });
test('SMS sends once with a deadline and no exposed code; rejected or ambiguous sends fail safely', async () => {
  const env = smsConfig(); let calls = 0;
  const adapter = new TwilioSmsProvider(env, async (url, init) => {
    calls++; assert.match(String(url), /^https:\/\/api.twilio.com\//); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    assert.equal((init?.body as URLSearchParams).get('ValidityPeriod'), '300');
    return Response.json({ sid: 'SM' + randomBytes(16).toString('hex'), status: 'accepted' });
  });
  await adapter.send('+919999900909', '345678'); assert.equal(calls, 1);
  for (const transport of [async () => new Response(null, { status: 503 }), async () => { throw new Error('provider private detail'); }])
    await assert.rejects(new TwilioSmsProvider(env, transport).send('+919999900909', '345678'), /could not send/);
});
test('provider settings reject incomplete configuration and development OTP in production', () => {
  assert.throws(() => readEnvironment({ OTP_MODE: 'provider' }), /SMS_PROVIDER/);
  assert.throws(() => readEnvironment({ EMAIL_PROVIDER: 'resend' }), /EMAIL_PROVIDER/);
  assert.throws(() => readEnvironment({ PUSH_PROVIDER: 'fcm' }), /FCM_SERVICE_ACCOUNT_JSON/);
  assert.throws(() => readEnvironment({ APP_ENV: 'production', OTP_MODE: 'development' }), /OTP_MODE/);
});
test('email uses a fixed non-sensitive template and stable provider idempotency key', async () => {
  const env = readEnvironment({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'test@example.invalid', RESEND_API_KEY: randomBytes(32).toString('hex') });
  const id = randomUUID(), references: string[] = [];
  const adapter = new ResendEmailProvider(env, async (_url, init) => {
    references.push(new Headers(init?.headers).get('idempotency-key')!);
    const body = JSON.parse(init?.body as string); assert.equal(body.text, publicNotification); assert.equal(body.html, undefined);
    assert.ok(init?.signal); return Response.json({ id });
  });
  for (let i = 0; i < 2; i++) assert.equal((await adapter.send({ destination: 'test@example.invalid', eventId: id })).status, 'SENT');
  assert.equal(references[0], references[1]);
  assert.equal((await new ResendEmailProvider(env, async () => { throw new Error(); }).send({ destination: 'test@example.invalid', eventId: id })).status, 'UNKNOWN');
});
test('disabled email and push adapters do not call external providers', async () => {
  const fail = async () => { throw new Error('Must never contact provider'); };
  for (const provider of [new ResendEmailProvider(readEnvironment({}), fail), new FcmPushProvider(readEnvironment({}), fail)])
    assert.equal((await provider.send({ destination: 'test', eventId: randomUUID() })).status, 'BLOCKED');
});
test('FCM uses short-lived OAuth, generic previews, rejects expired tokens and does not blindly resend', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = readEnvironment({ PUSH_PROVIDER: 'fcm', NOTIFICATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'), FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'pocket-test', client_email: 'test@pocket-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }) });
  let sends = 0, authorizations = 0;
  const provider = new FcmPushProvider(env, async (url, init) => {
    assert.ok(init?.signal); assert.equal(init?.redirect, 'error');
    if (String(url) === 'https://oauth2.googleapis.com/token') { authorizations++; return Response.json({ access_token: randomBytes(32).toString('hex'), expires_in: 3600, token_type: 'Bearer' }); }
    sends++; const message = JSON.parse(init?.body as string).message; assert.equal(message.notification.body, publicNotification);
    if (sends === 1) return Response.json({ name: 'projects/pocket-test/messages/test' });
    if (sends === 2) return Response.json({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 });
    throw new Error('ambiguous timeout');
  });
  const input = { destination: 'test-registration-token-123456789', eventId: randomUUID() };
  assert.equal((await provider.send(input)).status, 'SENT');
  assert.equal((await provider.send(input)).status, 'INVALID_DESTINATION');
  assert.equal((await provider.send(input)).status, 'UNKNOWN');
  assert.equal(sends, 3); assert.equal(authorizations, 1);
});
test('Razorpay rejects unknown payments, failed capture, wrong amount and fabricated callback IDs', async () => {
  const config = { mode: 'test' as const, keyId: 'rzp_test_ContractFixture', keySecret: randomBytes(32).toString('hex') };
  const unknown = new RazorpayProvider(config, async () => new Response(null, { status: 404 }));
  const input = { paymentId: 'pay_test', orderId: 'order_test', amountPaise: 100, currency: 'INR' };
  await assert.rejects(unknown.verifyPayment(input));
  for (const change of [{ status: 'failed' }, { amount: 99 }, { order_id: 'order_other' }, { captured: false }]) {
    const provider = new RazorpayProvider(config, async () => Response.json({ id: 'pay_test', order_id: 'order_test', amount: 100, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0, ...change }));
    await assert.rejects(provider.verifyPayment(input));
  }
  assert.equal(unknown.verifyCheckoutSignature('arbitrary', 'pay_test', '0'.repeat(64)), false);
});
test('WhatsApp signed webhook validates business, phone identity and supported event field', async t => {
  const env = readEnvironment({ APP_ENV: 'test', WHATSAPP_MODE: 'webhook', WHATSAPP_BUSINESS_ID: '1234567890', WHATSAPP_PHONE_NUMBER_ID: '1234567891', WHATSAPP_APP_SECRET: randomBytes(32).toString('hex'), WHATSAPP_VERIFY_TOKEN: randomBytes(32).toString('hex') });
  const app = Fastify(); registerWhatsAppWebhook(app, env, {} as WhatsAppService); t.after(() => app.close());
  const payload = (business: string, phone: string, field = 'messages') => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: business, changes: [{ field, value: { metadata: { phone_number_id: phone } } }] }] });
  const call = async (body: string, valid = true) => app.inject({ method: 'POST', url: '/api/v1/integrations/whatsapp/webhook', payload: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + (valid ? createHmac('sha256', env.WHATSAPP_APP_SECRET).update(body).digest('hex') : '0'.repeat(64)) } });
  assert.equal((await call(payload(env.WHATSAPP_BUSINESS_ID, env.WHATSAPP_PHONE_NUMBER_ID))).statusCode, 200);
  assert.equal((await call(payload('123', env.WHATSAPP_PHONE_NUMBER_ID))).statusCode, 403);
  assert.equal((await call(payload(env.WHATSAPP_BUSINESS_ID, '123'))).statusCode, 403);
  assert.equal((await call(payload(env.WHATSAPP_BUSINESS_ID, env.WHATSAPP_PHONE_NUMBER_ID, 'unsupported'))).statusCode, 400);
  assert.equal((await call(payload(env.WHATSAPP_BUSINESS_ID, env.WHATSAPP_PHONE_NUMBER_ID), false)).statusCode, 401);
});
