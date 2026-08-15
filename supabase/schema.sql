-- ============================================================
-- MECHA-NAV · Supabase Schema
-- 用法：在 Supabase SQL Editor 中整体执行本文件
-- ============================================================

create table if not exists categories (
  id text primary key,
  no int not null,
  name text not null default '',
  name_en text not null default '',
  icon text not null default '⬡',
  subcats jsonb not null default '[]',
  sound text not null default 'tools'
);

create table if not exists links (
  id text primary key,
  no text not null,
  name text not null default '',
  url text not null default '',
  description text not null default '',
  category text not null default '',
  sub text not null default '',
  badge text,
  icon text not null default '🔗',
  placeholder boolean not null default false
);

create table if not exists announcements (
  id text primary key,
  no text not null,
  kind text not null default 'text',
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists promos (
  id text primary key,
  icon text not null default '🛰️',
  title text not null default '',
  description text not null default '',
  link text not null default '',
  color text not null default 'cyan'
);

create table if not exists music_sources (
  id text primary key,
  kind text not null,
  name text not null default '',
  base_url text not null default '',
  enabled boolean not null default true,
  sort int not null default 0
);

create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'
);

create table if not exists visits (
  day date primary key,
  cnt int not null default 0
);

create index if not exists idx_links_no on links (no);
create index if not exists idx_links_category on links (category);

-- ============================================================
-- RPC：访问计数（前端按天去重后调用；匿名可执行）
-- ============================================================
create or replace function bump_visits()
returns table (today int, total int)
language plpgsql
security definer
as $$
declare
  v_total int;
begin
  insert into visits (day, cnt) values (current_date, 1)
  on conflict (day) do update set cnt = visits.cnt + 1;
  select coalesce(sum(cnt), 0) into v_total from visits;
  return query select (select cnt from visits where day = current_date), v_total;
end;
$$;

revoke all on function bump_visits() from public;
grant execute on function bump_visits() to anon, authenticated;

-- ============================================================
-- RPC：管理员全量导入（凭 settings.admin.token 令牌校验）
-- 前端「系统 → 上传全量」调用，令牌 = 管理员口令 SHA-256
-- ============================================================
create or replace function admin_import(payload jsonb, token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if token is null or v_token = '' or token <> v_token then
    raise exception 'invalid admin token';
  end if;

  delete from links; delete from announcements; delete from promos; delete from music_sources; delete from categories;

  insert into categories (id, no, name, name_en, icon, subcats, sound)
  select x.id, x.no, x.name, x."nameEn", x.icon, x.subcats, x.sound
  from jsonb_to_recordset(payload->'categories') as
    x(id text, no int, name text, "nameEn" text, icon text, subcats jsonb, sound text);

  insert into links (id, no, name, url, description, category, sub, badge, icon, placeholder)
  select x.id, x.no, x.name, x.url, x.desc, x.cat, x.sub, x.badge, x.icon, coalesce(x.placeholder, false)
  from jsonb_to_recordset(payload->'links') as
    x(id text, no text, name text, url text, desc text, cat text, sub text, badge text, icon text, placeholder boolean);

  insert into announcements (id, no, kind, title, content)
  select x.id, x.no, x.kind, x.title, x.content
  from jsonb_to_recordset(payload->'announcements') as
    x(id text, no text, kind text, title text, content text, time text);

  insert into promos (id, icon, title, description, link, color)
  select x.id, x.icon, x.title, x.desc, x.link, x.color
  from jsonb_to_recordset(payload->'promos') as
    x(id text, icon text, title text, desc text, link text, color text);

  insert into music_sources (id, kind, name, base_url, enabled, sort)
  select x.id, x.kind, x.name, x."baseUrl", coalesce(x.enabled, true), row_number() over ()
  from jsonb_to_recordset(payload->'musicSources') as
    x(id text, kind text, name text, "baseUrl" text, enabled boolean);
end;
$$;

revoke all on function admin_import(jsonb, text) from public;
grant execute on function admin_import(jsonb, text) to anon, authenticated;

-- ============================================================
-- RPC：背景图上传配额（每日所有访客共享 DAILY_MAX 次）
-- 前端「背景设置 → 上传」调用；匿名可执行
-- ============================================================
create table if not exists bg_quota (
  day date primary key,
  used int not null default 0
);

create or replace function bg_quota_consume()
returns table (ok boolean, remaining int)
language plpgsql
security definer
as $$
declare
  v_used int;
begin
  insert into bg_quota (day, used) values (current_date, 1)
  on conflict (day) do update set used = bg_quota.used + 1
  returning used into v_used;
  if v_used > 10 then
    return query select false, greatest(0, 10 - v_used);
  else
    return query select true, greatest(0, 10 - v_used);
  end if;
end;
$$;

revoke all on function bg_quota_consume() from public;
grant execute on function bg_quota_consume() to anon, authenticated;

alter table bg_quota enable row level security;

-- ============================================================
-- 管理员令牌初始化（可选）：
-- 将下方 token 替换为管理员口令的 SHA-256 十六进制值
-- ============================================================
-- insert into settings (key, value)
-- values ('admin', '{"token":"240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"}')
-- on conflict (key) do nothing; -- 示例为 admin123 的 SHA-256

-- ============================================================
-- RLS：匿名只读；写入需管理员（authenticated 角色）
-- ============================================================
alter table categories enable row level security;
alter table links enable row level security;
alter table announcements enable row level security;
alter table promos enable row level security;
alter table music_sources enable row level security;
alter table settings enable row level security;
alter table visits enable row level security;

create policy cat_read on categories for select using (true);
create policy link_read on links for select using (true);
create policy ann_read on announcements for select using (true);
create policy promo_read on promos for select using (true);
create policy msrc_read on music_sources for select using (true);
create policy visits_read on visits for select using (true);
create policy settings_admin_read on settings for select using (auth.role() = 'authenticated');

create policy cat_write on categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy link_write on links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy ann_write on announcements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy promo_write on promos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy msrc_write on music_sources for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy settings_admin_write on settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
