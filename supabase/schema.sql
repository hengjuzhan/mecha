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

-- 管理员清空全部访问记录（需有效的管理员口令 token）
-- 前端「系统 → 清空访问人数」调用，令牌 = 管理员口令 SHA-256
create or replace function visits_reset(p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if p_token is null or v_token = '' or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
  delete from visits;
end;
$$;

revoke all on function visits_reset(text) from public;
grant execute on function visits_reset(text) to anon, authenticated;

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
  select x.id, x.no, x.name, x.url, x."desc", x."cat", x."sub", x."badge", x."icon", coalesce(x."placeholder", false)
  from jsonb_to_recordset(payload->'links') as
    x(id text, no text, name text, url text, "desc" text, "cat" text, "sub" text, "badge" text, "icon" text, "placeholder" boolean);

  insert into announcements (id, no, kind, title, content)
  select x.id, x.no, x.kind, x.title, x.content
  from jsonb_to_recordset(payload->'announcements') as
    x(id text, no text, kind text, title text, content text, time text);

  insert into promos (id, icon, title, description, link, color)
  select x.id, x.icon, x.title, x."desc", x.link, x.color
  from jsonb_to_recordset(payload->'promos') as
    x(id text, icon text, title text, "desc" text, link text, color text);

  insert into music_sources (id, kind, name, base_url, enabled, sort)
  select x.id, x.kind, x.name, x."baseUrl", coalesce(x.enabled, true), row_number() over ()
  from jsonb_to_recordset(payload->'musicSources') as
    x(id text, kind text, name text, "baseUrl" text, enabled boolean);
end;
$$;

revoke all on function admin_import(jsonb, text) from public;
grant execute on function admin_import(jsonb, text) to anon, authenticated;

-- ============================================================
-- RPC：站点文案覆盖层（跨设备同步）
-- 管理员行内编辑文字后推送 texts_set（凭 settings.admin.token 校验），
-- 各设备进入时通过 texts_get 拉取，实现所有设备文案一致
-- ============================================================
create or replace function texts_get()
returns table (texts jsonb)
language sql
security definer stable
as $$
  select coalesce(value, '{}'::jsonb) from settings where key = 'texts';
$$;

drop function if exists texts_set(jsonb, text);
create or replace function texts_set(p_texts jsonb, p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if p_token is null or v_token = '' or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
  insert into settings (key, value) values ('texts', coalesce(p_texts, '{}'::jsonb))
  on conflict (key) do update set value = coalesce(excluded.value, '{}'::jsonb);
end;
$$;

revoke all on function texts_get() from public;
revoke all on function texts_set(jsonb, text) from public;
grant execute on function texts_get() to anon, authenticated;
grant execute on function texts_set(jsonb, text) to anon, authenticated;

-- ============================================================
-- RPC：全站数据（分类/站点/公告/推广位/音乐源）云端同步
-- 管理员编辑任意条目后推送 site_data_set（凭 settings.admin.token 校验），
-- 各设备进入时通过 site_data_get 拉取，实现所有设备数据一致
-- ============================================================
create or replace function site_data_get()
returns table (data jsonb)
language sql
security definer stable
as $$
  select coalesce(value, '{}'::jsonb) from settings where key = 'sitedata';
$$;

create or replace function site_data_set(p_data jsonb, p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if p_token is null or v_token = '' or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
  insert into settings (key, value) values ('sitedata', coalesce(p_data, '{}'::jsonb))
  on conflict (key) do update set value = coalesce(excluded.value, '{}'::jsonb);
end;
$$;

revoke all on function site_data_get() from public;
revoke all on function site_data_set(jsonb, text) from public;
grant execute on function site_data_get() to anon, authenticated;
grant execute on function site_data_set(jsonb, text) to anon, authenticated;

-- ============================================================
-- 访客留言板：表 + RPC（支持楼中楼回复；匿名可读写）
-- parent_id 指向上一条留言 id，顶层为 null
-- ============================================================
create table if not exists guest_messages (
  id text primary key,
  parent_id text references guest_messages(id) on delete cascade,
  name text not null default '',
  content text not null default '',
  ts bigint not null
);
create index if not exists idx_guest_ts on guest_messages (ts desc);

create or replace function guest_list()
returns table (id text, parent_id text, name text, content text, ts bigint)
language sql
security definer stable
as $$
  select id, parent_id, name, content, ts
  from guest_messages
  order by ts asc;
$$;

create or replace function guest_add(p_id text, p_name text, p_content text)
returns void
language plpgsql
security definer
as $$
declare
  v_id text;
begin
  v_id := 'g' || substr(md5(random()::text), 1, 12);
  insert into guest_messages (id, parent_id, name, content, ts)
  values (v_id, nullif(p_id, ''), coalesce(p_name, ''), substr(p_content, 1, 300), floor(extract(epoch from now()) * 1000)::bigint);
end;
$$;

create or replace function guest_delete(p_id text, token text)
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
  delete from guest_messages where id = p_id;
end;
$$;

-- 管理员清空全部留言（需有效的管理员口令 token）
create or replace function guest_clear(p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if p_token is null or v_token = '' or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
  delete from guest_messages;
end;
$$;

revoke all on function guest_list() from public;
revoke all on function guest_add(text, text, text) from public;
revoke all on function guest_delete(text, text) from public;
revoke all on function guest_clear(text) from public;
grant execute on function guest_list() to anon, authenticated;
grant execute on function guest_add(text, text, text) to anon, authenticated;
grant execute on function guest_delete(text, text) to anon, authenticated;
grant execute on function guest_clear(text) to anon, authenticated;

alter table guest_messages enable row level security;

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

-- 只读查询今日剩余次数（不消耗）
create or replace function bg_quota_remaining()
returns table (remaining int)
language sql
security definer stable
as $$
  select greatest(0, 10 - coalesce((select used from bg_quota where day = current_date), 0));
$$;

revoke all on function bg_quota_remaining() from public;
grant execute on function bg_quota_remaining() to anon, authenticated;

alter table bg_quota enable row level security;

-- ============================================================
-- 共享背景：所有设备同步的页面背景图与深浅色调
-- 前端「背景设置」上传/更换时通过 bg_set 写入，各设备加载时通过 bg_get 读取
-- ============================================================
create table if not exists site_bg (
  id int primary key default 1,
  bg_image text not null default '',
  bg_tone text not null default 'dark',
  updated_at timestamptz not null default now()
);
insert into site_bg (id) values (1) on conflict (id) do nothing;

-- 读取共享背景（不消耗配额；匿名可执行）
create or replace function bg_get()
returns table (bg_image text, bg_tone text)
language sql
security definer stable
as $$
  select bg_image, bg_tone from site_bg where id = 1;
$$;

-- 写入共享背景（不消耗配额；配额由前端 bg_quota_consume 控制，管理员与访客均可同步）
create or replace function bg_set(p_image text, p_tone text)
returns void
language sql
security definer
as $$
  update site_bg
  set bg_image = coalesce(p_image, ''), bg_tone = coalesce(p_tone, 'dark'), updated_at = now()
  where id = 1;
$$;

revoke all on function bg_get() from public;
revoke all on function bg_set(text, text) from public;
grant execute on function bg_get() to anon, authenticated;
grant execute on function bg_set(text, text) to anon, authenticated;

-- 管理员清除所有设备共享的背景（需有效的管理员口令 token）
-- 前端「系统 → 清除共享背景」调用，令牌 = 管理员口令 SHA-256
create or replace function bg_clear(p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if p_token is null or v_token = '' or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
  update site_bg set bg_image = '', bg_tone = 'dark', updated_at = now() where id = 1;
end;
$$;

revoke all on function bg_clear(text) from public;
grant execute on function bg_clear(text) to anon, authenticated;

alter table site_bg enable row level security;

-- ============================================================
-- RPC：管理员令牌初始化（首次设置 admin token，无需旧令牌校验）
-- 前端保存数据库连接时自动调用，将管理员口令 SHA-256 推送到数据库
-- 设置后再次调用需提供旧令牌（防止被覆盖）
-- ============================================================
create or replace function admin_token_init(p_token text, p_old_token text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if v_token <> '' then
    -- 已有令牌：需要提供旧令牌才能修改
    if p_old_token is null or p_old_token = '' or p_old_token <> v_token then
      raise exception 'admin token already exists; provide p_old_token to change';
    end if;
  end if;
  insert into settings (key, value) values ('admin', jsonb_build_object('token', coalesce(p_token, '')))
  on conflict (key) do update set value = jsonb_build_object('token', coalesce(p_token, ''));
end;
$$;

revoke all on function admin_token_init(text, text) from public;
grant execute on function admin_token_init(text, text) to anon, authenticated;

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

drop policy if exists cat_read on categories;
drop policy if exists link_read on links;
drop policy if exists ann_read on announcements;
drop policy if exists promo_read on promos;
drop policy if exists msrc_read on music_sources;
drop policy if exists visits_read on visits;
drop policy if exists settings_admin_read on settings;
create policy cat_read on categories for select using (true);
create policy link_read on links for select using (true);
create policy ann_read on announcements for select using (true);
create policy promo_read on promos for select using (true);
create policy msrc_read on music_sources for select using (true);
create policy visits_read on visits for select using (true);
create policy settings_admin_read on settings for select using (auth.role() = 'authenticated');

drop policy if exists cat_write on categories;
drop policy if exists link_write on links;
drop policy if exists ann_write on announcements;
drop policy if exists promo_write on promos;
drop policy if exists msrc_write on music_sources;
drop policy if exists settings_admin_write on settings;
create policy cat_write on categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy link_write on links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy ann_write on announcements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy promo_write on promos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy msrc_write on music_sources for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy settings_admin_write on settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
