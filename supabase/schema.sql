-- ============================================================
-- MECHA-NAV · Supabase Schema v2（云端同步统一版）
-- 用法：在 Supabase SQL Editor 中整体执行本文件
-- 设计：
--   · 所有管理员写操作统一经 admin_check() 校验令牌（数据库无令牌时自注册）
--   · 访问计数：visits_bump(增量) / visits_get(只读) / visits_reset(管理员清空)
--   · 全站数据与文案：settings 表 JSON 覆盖层（site_data_* / texts_*）
--   · 留言对话：guest_messages 表（guest_*）
--   · 背景配额与共享背景：bg_quota / site_bg（bg_*）
-- ============================================================

-- ============ 清理旧版函数（v1 遗留，避免签名冲突） ============
drop function if exists bump_visits();
drop function if exists visits_reset(text);
drop function if exists admin_import(jsonb, text);
drop function if exists texts_get();
drop function if exists texts_set(jsonb, text);
drop function if exists site_data_get();
drop function if exists site_data_set(jsonb, text);
drop function if exists guest_list();
drop function if exists guest_add(text, text, text);
drop function if exists guest_delete(text, text);
drop function if exists guest_clear(text);
drop function if exists bg_quota_consume();
drop function if exists bg_quota_remaining();
drop function if exists bg_get();
drop function if exists bg_set(text, text);
drop function if exists bg_clear(text);
drop function if exists admin_token_init(text, text);
drop function if exists admin_check(text);

-- ============ 表 ============
create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'
);

create table if not exists visits (
  day date primary key,
  cnt int not null default 0
);

create table if not exists guest_messages (
  id text primary key,
  parent_id text references guest_messages(id) on delete cascade,
  name text not null default '',
  content text not null default '',
  ts bigint not null
);
create index if not exists idx_guest_ts on guest_messages (ts desc);

create table if not exists bg_quota (
  day date primary key,
  used int not null default 0
);

create table if not exists site_bg (
  id int primary key default 1,
  bg_image text not null default '',
  bg_tone text not null default 'dark',
  updated_at timestamptz not null default now()
);
insert into site_bg (id) values (1) on conflict (id) do nothing;

-- v1 分表（历史兼容保留，v2 全站数据统一走 settings.sitedata JSON）
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
create index if not exists idx_links_no on links (no);
create index if not exists idx_links_category on links (category);

-- ============ 管理员令牌统一校验 ============
-- 无令牌：用传入令牌自注册（首次使用即绑定管理员口令哈希）
-- 有令牌：比对，不匹配或空令牌则拒绝
create or replace function admin_check(p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if v_token = '' then
    if p_token is null or p_token = '' then
      raise exception 'invalid admin token';
    end if;
    insert into settings (key, value) values ('admin', jsonb_build_object('token', p_token))
    on conflict (key) do update set value = jsonb_build_object('token', p_token);
    return;
  end if;
  if p_token is null or p_token <> v_token then
    raise exception 'invalid admin token';
  end if;
end;
$$;

revoke all on function admin_check(text) from public;
grant execute on function admin_check(text) to anon, authenticated;

-- 管理员令牌初始化 / 修改（修改需旧令牌，防止被覆盖）
create or replace function admin_token_init(p_token text, p_old_token text default null)
returns void
language plpgsql
security definer
as $$
declare
  v_token text;
begin
  select coalesce(value->>'token', '') into v_token from settings where key = 'admin';
  if v_token <> '' and (p_old_token is null or p_old_token = '' or p_old_token <> v_token) then
    raise exception 'admin token already exists; provide p_old_token to change';
  end if;
  insert into settings (key, value) values ('admin', jsonb_build_object('token', coalesce(p_token, '')))
  on conflict (key) do update set value = jsonb_build_object('token', coalesce(p_token, ''));
end;
$$;

revoke all on function admin_token_init(text, text) from public;
grant execute on function admin_token_init(text, text) to anon, authenticated;

-- ============ 访问计数 ============
-- 增量计数：每次调用今日与累计同时 +p_n（页面进入 +1，氛围增量 +1~4）
create or replace function visits_bump(p_n int)
returns table (today int, total int)
language plpgsql
security definer
as $$
declare
  v_total int;
begin
  insert into visits (day, cnt) values (current_date, greatest(coalesce(p_n, 1), 1))
  on conflict (day) do update set cnt = visits.cnt + greatest(coalesce(p_n, 1), 1);
  select coalesce(sum(cnt), 0) into v_total from visits;
  return query select (select cnt from visits where day = current_date), v_total;
end;
$$;

-- 只读查询（连接测试 / 进入页面同步显示，不计数）
create or replace function visits_get()
returns table (today int, total int)
language sql
security definer stable
as $$
  select coalesce((select cnt from visits where day = current_date), 0),
         coalesce((select sum(cnt) from visits), 0);
$$;

-- 管理员清空全部访问记录（清空后所有设备从 1 重新开始）
create or replace function visits_reset(p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform admin_check(p_token);
  delete from visits where true;
end;
$$;

revoke all on function visits_bump(int) from public;
revoke all on function visits_get() from public;
revoke all on function visits_reset(text) from public;
grant execute on function visits_bump(int) to anon, authenticated;
grant execute on function visits_get() to anon, authenticated;
grant execute on function visits_reset(text) to anon, authenticated;

-- ============ 全站数据（分类/站点/公告/推广位/音乐源） ============
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
begin
  perform admin_check(p_token);
  insert into settings (key, value) values ('sitedata', coalesce(p_data, '{}'::jsonb))
  on conflict (key) do update set value = coalesce(excluded.value, '{}'::jsonb);
end;
$$;

revoke all on function site_data_get() from public;
revoke all on function site_data_set(jsonb, text) from public;
grant execute on function site_data_get() to anon, authenticated;
grant execute on function site_data_set(jsonb, text) to anon, authenticated;

-- ============ 站点文案覆盖层 ============
create or replace function texts_get()
returns table (texts jsonb)
language sql
security definer stable
as $$
  select coalesce(value, '{}'::jsonb) from settings where key = 'texts';
$$;

create or replace function texts_set(p_texts jsonb, p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform admin_check(p_token);
  insert into settings (key, value) values ('texts', coalesce(p_texts, '{}'::jsonb))
  on conflict (key) do update set value = coalesce(excluded.value, '{}'::jsonb);
end;
$$;

revoke all on function texts_get() from public;
revoke all on function texts_set(jsonb, text) from public;
grant execute on function texts_get() to anon, authenticated;
grant execute on function texts_set(jsonb, text) to anon, authenticated;

-- ============ 访客留言对话 ============
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

create or replace function guest_delete(p_id text, p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform admin_check(p_token);
  delete from guest_messages where id = p_id;
end;
$$;

create or replace function guest_clear(p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform admin_check(p_token);
  delete from guest_messages where true;
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

-- ============ 背景图上传配额（每日所有访客共享 10 次） ============
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
    return query select false, 0;
  else
    return query select true, greatest(0, 10 - v_used);
  end if;
end;
$$;

create or replace function bg_quota_remaining()
returns table (remaining int)
language sql
security definer stable
as $$
  select greatest(0, 10 - coalesce((select used from bg_quota where day = current_date), 0));
$$;

revoke all on function bg_quota_consume() from public;
revoke all on function bg_quota_remaining() from public;
grant execute on function bg_quota_consume() to anon, authenticated;
grant execute on function bg_quota_remaining() to anon, authenticated;

-- ============ 共享背景（所有设备同步的页面背景图与深浅色调） ============
create or replace function bg_get()
returns table (bg_image text, bg_tone text)
language sql
security definer stable
as $$
  select bg_image, bg_tone from site_bg where id = 1;
$$;

create or replace function bg_set(p_image text, p_tone text)
returns void
language sql
security definer
as $$
  update site_bg
  set bg_image = coalesce(p_image, ''), bg_tone = coalesce(p_tone, 'dark'), updated_at = now()
  where id = 1;
$$;

create or replace function bg_clear(p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform admin_check(p_token);
  update site_bg set bg_image = '', bg_tone = 'dark', updated_at = now() where id = 1;
end;
$$;

revoke all on function bg_get() from public;
revoke all on function bg_set(text, text) from public;
revoke all on function bg_clear(text) from public;
grant execute on function bg_get() to anon, authenticated;
grant execute on function bg_set(text, text) to anon, authenticated;
grant execute on function bg_clear(text) to anon, authenticated;

-- ============ RLS：匿名仅可经上述 RPC 访问 ============
alter table settings enable row level security;
alter table visits enable row level security;
alter table guest_messages enable row level security;
alter table bg_quota enable row level security;
alter table site_bg enable row level security;
alter table categories enable row level security;
alter table links enable row level security;
alter table announcements enable row level security;
alter table promos enable row level security;
alter table music_sources enable row level security;
