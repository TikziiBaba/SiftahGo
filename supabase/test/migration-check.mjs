import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Kullanım: node supabase/test/migration-check.mjs <git-ref> <ek-dosya>
// <git-ref>'teki şema + ek dosya ile güncel schema.sql aynı veritabanını vermeli (canlıya ek dosya uygulanır,
// şema dosyası sıfırdan kurar). Farkları yazar; fark varsa çıkış kodu 1.
const [ref, migrationPath] = process.argv.slice(2);
if (!ref || !migrationPath) {
  console.error('Kullanım: node supabase/test/migration-check.mjs <git-ref> <ek-dosya>');
  process.exit(2);
}

const currentSchema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const oldSchema = execFileSync('git', ['show', `${ref}:supabase/schema.sql`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const migration = readFileSync(migrationPath, 'utf8');

// Supabase taklidi (schema.test.mjs ile aynı)
const newDb = async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
      email_confirmed_at timestamptz default now(), created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, extensions, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  return db;
};

const snapshot = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  const lines = (rows, fmt) => Object.fromEntries(rows.map((r) => fmt(r)));
  return {
    'sütun': lines(await q(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'public'`),
      (r) => [`${r.table_name}.${r.column_name}`, `${r.data_type} null=${r.is_nullable} default=${r.column_default}`]),
    'kısıt': lines(await q(`
      select c.conrelid::regclass::text t, c.conname, pg_get_constraintdef(c.oid) def
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'`),
      (r) => [`${r.t}.${r.conname}`, r.def]),
    'indeks': lines(await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'`),
      (r) => [`${r.tablename}.${r.indexname}`, r.indexdef]),
    'fonksiyon': lines(await q(`
      select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`),
      (r) => [r.sig, r.def]),
    'fonksiyon yetkisi': lines(await q(`
      select p.oid::regprocedure::text sig, coalesce(p.proacl::text, '(varsayılan)') acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`),
      (r) => [r.sig, r.acl]),
    'tetikleyici': lines(await q(`
      select t.tgrelid::regclass::text tbl, t.tgname, pg_get_triggerdef(t.oid) def
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal`),
      (r) => [`${r.tbl}.${r.tgname}`, r.def]),
    'politika': lines(await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public'`),
      (r) => [`${r.tablename}.${r.policyname}`, `${r.cmd} ${r.roles} using=${r.qual} check=${r.with_check}`]),
    'RLS': lines(await q(`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`),
      (r) => [r.relname, String(r.relrowsecurity)]),
    'plans': lines(await q(`select id, name, price, staff_limit, features::text f, sort_order from public.plans`),
      (r) => [r.id, `${r.name} ${r.price} ${r.staff_limit} ${r.f} ${r.sort_order}`]),
  };
};

// Eski şemaya örnek veri koy, ek dosyayı uygula
const migrated = await newDb();
await migrated.exec(oldSchema);
const owner = '00000000-0000-0000-0000-0000000000c1';
const customer = '00000000-0000-0000-0000-0000000000c2';
await migrated.exec(`
  insert into auth.users values ('${owner}', 'sahip@x.com', '{"full_name":"Sahip","role":"business"}');
  insert into auth.users values ('${customer}', 'musteri@x.com', '{"full_name":"Müşteri"}');
  insert into public.businesses (owner_id, slug, name, city, category) values ('${owner}', 'veri-berber', 'Veri Berber', 'İstanbul', 'berber');
  insert into public.appointments (business_id, staff_id, customer_id, service_name, customer_name, customer_phone, starts_at, ends_at, status)
    select b.id, s.id, '${customer}', 'Saç Kesimi', 'Müşteri', '05550000000', now() + interval '1 day', now() + interval '1 day 30 minutes', 'confirmed'
    from public.businesses b join public.staff s on s.business_id = b.id where b.slug = 'veri-berber';
`);
const before = (await migrated.query(`select id, business_id, staff_id, customer_id, service_name, starts_at, ends_at, status, price from public.appointments`)).rows;
await migrated.exec(migration);
const after = (await migrated.query(`select id, business_id, staff_id, customer_id, service_name, starts_at, ends_at, status, price from public.appointments`)).rows;

let diffs = 0;
const report = (msg) => { console.log('FARK: ' + msg); diffs++; };

if (before.length !== 1 || JSON.stringify(before) !== JSON.stringify(after)) report('ek dosya mevcut randevu verisini değiştirdi veya sildi');
const defaults = (await migrated.query(`select customer_late_count, business_delay_count from public.appointments`).catch(() => ({ rows: [] }))).rows[0];
if (defaults?.customer_late_count !== 0 || defaults?.business_delay_count !== 0) report('mevcut randevuların yeni sayaçları 0 değil');

const fresh = await newDb();
await fresh.exec(currentSchema);

const a = await snapshot(migrated);
const b = await snapshot(fresh);
for (const kind of Object.keys(a)) {
  for (const key of new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])])) {
    if (!(key in a[kind])) report(`${kind} yalnızca schema.sql'de var: ${key}`);
    else if (!(key in b[kind])) report(`${kind} yalnızca ${ref} + ek dosyada var: ${key}`);
    else if (a[kind][key] !== b[kind][key]) report(`${kind} farklı: ${key}\n  ${ref}+ek: ${a[kind][key]}\n  schema.sql: ${b[kind][key]}`);
  }
}

console.log(diffs ? `\n${diffs} FARK` : 'FARK YOK');
process.exit(diffs ? 1 : 0);
