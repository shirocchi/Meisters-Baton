// One-time administrator ingestion. A high-entropy, expiring capability authorizes
// only the exact hashes and byte lengths in the private import manifest.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const bucket = 'propeller-wiki-media';
const digest = async (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Unauthorized' }, 401);
    const { data, error } = await db
      .from('propeller_wiki_sources')
      .select('content')
      .eq('slug', 'growi-import-session')
      .maybeSingle();
    const session = data?.content;
    if (
      error ||
      !session ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now() ||
      (await digest(new TextEncoder().encode(token).buffer)) !== session.tokenHash
    )
      return json({ error: 'Unauthorized' }, 401);
    const sha = req.headers.get('X-Asset-Hash') ?? '';
    if (!/^[a-f0-9]{64}$/.test(sha)) return json({ error: 'Invalid hash' }, 400);
    const allowed = session.assets.find((a: { sha256: string }) => a.sha256 === sha);
    if (!allowed || allowed.bytes > 52428800)
      return json({ error: 'Outside import manifest' }, 403);
    const { data: settings, error: bucketError } = await db.storage.getBucket(bucket);
    if (bucketError || settings.public) return json({ error: 'Private bucket required' }, 409);
    const { data: entries, error: listError } = await db.storage
      .from(bucket)
      .list('', { search: sha, limit: 2 });
    if (listError || !entries) return json({ error: 'Cannot inspect storage' }, 502);
    if (entries.some((entry) => entry.name === sha)) {
      const { data: existing, error: readError } = await db.storage.from(bucket).download(sha);
      if (readError || !existing) return json({ error: 'Cannot read existing object' }, 502);
      const bytes = await existing.arrayBuffer();
      return json({ sha256: await digest(bytes), bytes: bytes.byteLength, existing: true });
    }
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'Missing body' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > allowed.bytes) {
        await reader.cancel();
        return json({ error: 'Too large' }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (size !== allowed.bytes || (await digest(bytes.buffer)) !== sha)
      return json({ error: 'Integrity mismatch' }, 400);
    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(sha, bytes, { contentType: allowed.contentType, upsert: false, cacheControl: '0' });
    if (uploadError) return json({ error: 'Upload failed' }, 502);
    const { data: check, error: checkError } = await db.storage.from(bucket).download(sha);
    if (checkError || !check) return json({ error: 'Readback failed' }, 502);
    const verified = await check.arrayBuffer();
    return json({ sha256: await digest(verified), bytes: verified.byteLength, existing: false });
  } catch {
    return json({ error: 'Import failed' }, 500);
  }
});
