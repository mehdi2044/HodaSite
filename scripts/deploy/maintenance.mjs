// Runs inside ops through stdin. Never print credentials or response bodies.
import { createHash } from 'node:crypto';
const mode = process.argv[2];
if (mode === 'fingerprint') {
  const keys=['DATABASE_URL','PROJECT_ID','STORAGE_PROVIDER','S3_ENDPOINT','S3_BUCKET','S3_PREFIX_FILE','MEDIA_DIR'];
  console.log(createHash('sha256').update(JSON.stringify(keys.map(key=>process.env[key] ?? ''))).digest('hex'));
  process.exit(0);
}
if (!['on', 'off', 'drain', 'health'].includes(mode)) process.exit(2);
const origin = process.env.APP_URL;
const secret = process.env.MAINTENANCE_SECRET;
if (!origin || !secret) process.exit(2);
const deadline = Date.now() + 60000;
let ok = false;
while (Date.now() < deadline && !ok) {
  try {
    const response = await fetch(`${origin}/api/${mode === 'health' ? 'health' : 'system/maintenance'}`, {
      method: ['on', 'off'].includes(mode) ? 'POST' : 'GET',
      headers: { 'x-maintenance-secret': secret },
      body: ['on', 'off'].includes(mode) ? `state=${mode}&reason=deploy` : undefined,
      signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))),
    });
    const data = await response.json();
    ok = response.ok && (mode === 'health' ? data.db === 'ok' :
      mode === 'drain' ? data.state === 'on' && data.inFlight === 0 : data.state === mode);
  } catch { /* fail closed until bounded startup/drain deadline */ }
  if (!ok) await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ok) { console.error(`Deployment ${mode} confirmation failed`); process.exit(1); }
