-- Supabase SQL Editorで実行
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade, username text unique not null, kanji text, stats jsonb not null default '{}'::jsonb, points integer not null default 0, updated_at timestamptz default now());
alter table public.profiles enable row level security;
create policy "profiles view" on public.profiles for select using(true);
create policy "self update" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
create table if not exists public.match_queue(room_id uuid primary key default gen_random_uuid(),player1_id uuid not null references auth.users(id),player2_id uuid references auth.users(id),player1_kanji text not null,player2_kanji text,player1_stats jsonb not null,player2_stats jsonb,status text default 'waiting',created_at timestamptz default now(),finished_by uuid,winner_id uuid);
alter table public.match_queue enable row level security;
create policy "queue participant read" on public.match_queue for select using(auth.uid()=player1_id or auth.uid()=player2_id);
create or replace function public.new_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,username) values(new.id,coalesce(new.raw_user_meta_data->>'username','Player-'||substr(new.id::text,1,8)));return new;end $$;
drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert on auth.users for each row execute procedure public.new_profile();
create or replace function public.find_or_create_match(p_kanji text,p_stats jsonb) returns public.match_queue language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); q public.match_queue%rowtype; outrow public.match_queue%rowtype;
begin if u is null then raise exception 'Login required';end if;
select * into q from public.match_queue where status='waiting' and player1_id<>u and player2_id is null order by created_at for update skip locked limit 1;
if found then update public.match_queue set player2_id=u,player2_kanji=p_kanji,player2_stats=p_stats,status='matched' where room_id=q.room_id returning * into outrow;return outrow;
else insert into public.match_queue(player1_id,player1_kanji,player1_stats) values(u,p_kanji,p_stats) returning * into outrow;return outrow;end if;end $$;
grant execute on function public.find_or_create_match(text,jsonb) to authenticated;
create or replace function public.start_match_room(p_room_id uuid) returns public.match_queue language plpgsql security definer set search_path=public as $$ declare u uuid:=auth.uid();q public.match_queue%rowtype;begin select * into q from public.match_queue where room_id=p_room_id for update;if u not in (q.player1_id,q.player2_id) then raise exception 'Unauthorized';end if;if q.player2_id is null then raise exception 'Waiting';end if;update public.match_queue set status='started' where room_id=p_room_id returning * into q;return q;end $$;
grant execute on function public.start_match_room(uuid) to authenticated;
create or replace function public.cancel_match_room(p_room_id uuid) returns void language plpgsql security definer set search_path=public as $$ declare u uuid:=auth.uid();q public.match_queue%rowtype;begin select * into q from public.match_queue where room_id=p_room_id for update;if u<>q.player1_id and u<>q.player2_id then raise exception 'Unauthorized';end if;if q.status='waiting' then update public.match_queue set status='cancelled' where room_id=p_room_id;end if;end $$;
grant execute on function public.cancel_match_room(uuid) to authenticated;
create or replace function public.finish_match(p_room_id uuid,p_won boolean) returns public.profiles language plpgsql security definer set search_path=public as $$ declare u uuid:=auth.uid();q public.match_queue%rowtype;p public.profiles%rowtype;begin select * into q from public.match_queue where room_id=p_room_id for update;if u<>q.player1_id and u<>q.player2_id then raise exception 'Unauthorized';end if;if q.status not in ('started','matched') or q.finished_by is not null then raise exception 'Already finished';end if;update public.profiles set points=greatest(0,points+case when p_won then 50 else -40 end),updated_at=now() where id=u returning * into p;update public.match_queue set status='finished',finished_by=u,winner_id=case when p_won then u else (case when u=q.player1_id then q.player2_id else q.player1_id end) end where room_id=p_room_id;return p;end $$;
grant execute on function public.finish_match(uuid,boolean) to authenticated;
do $$ begin alter publication supabase_realtime add table public.match_queue;exception when duplicate_object then null;end $$;
