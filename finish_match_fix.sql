-- Kanji Battle ONLINE: start readiness + per-player result settlement migration
-- Run once in Supabase SQL Editor. Safe to rerun.

alter table public.match_queue
  add column if not exists player1_ready boolean not null default false,
  add column if not exists player2_ready boolean not null default false,
  add column if not exists settled_by uuid[] not null default '{}'::uuid[];

create or replace function public.start_match_room(p_room_id uuid)
returns public.match_queue
language plpgsql
security definer
set search_path=public
as $$
declare
  u uuid := auth.uid();
  q public.match_queue%rowtype;
begin
  select * into q
  from public.match_queue
  where room_id = p_room_id
  for update;

  if q.room_id is null then raise exception 'Room not found'; end if;
  if u is null or u not in (q.player1_id, q.player2_id) then raise exception 'Unauthorized'; end if;
  if q.player2_id is null then raise exception 'Waiting for opponent'; end if;
  if q.status = 'finished' or q.status = 'cancelled' then raise exception 'Match already finished'; end if;

  if u = q.player1_id then
    update public.match_queue set player1_ready=true where room_id=p_room_id;
  elsif u = q.player2_id then
    update public.match_queue set player2_ready=true where room_id=p_room_id;
  end if;

  select * into q from public.match_queue where room_id=p_room_id;

  if q.player1_ready and q.player2_ready then
    update public.match_queue set status='started' where room_id=p_room_id returning * into q;
  else
    update public.match_queue set status='matched' where room_id=p_room_id returning * into q;
  end if;

  return q;
end;
$$;

grant execute on function public.start_match_room(uuid) to authenticated;

create or replace function public.finish_match(p_room_id uuid, p_won boolean)
returns public.profiles
language plpgsql
security definer
set search_path=public
as $$
declare
  u uuid := auth.uid();
  q public.match_queue%rowtype;
  p public.profiles%rowtype;
  winner uuid;
  actual_win boolean;
begin
  select * into q from public.match_queue where room_id=p_room_id for update;

  if q.room_id is null then raise exception 'Room not found'; end if;
  if u is null or u not in (q.player1_id,q.player2_id) then raise exception 'Unauthorized'; end if;
  if q.status not in ('started','finished') then raise exception 'Match not started'; end if;
  if u = any(coalesce(q.settled_by,'{}'::uuid[])) then raise exception 'Already settled for this player'; end if;

  -- The first finisher records the result; the second player settles using that same winner.
  winner := q.winner_id;
  if winner is null then
    winner := case when p_won then u else (case when u=q.player1_id then q.player2_id else q.player1_id end) end;
  end if;
  actual_win := (winner=u);

  update public.profiles
  set points=greatest(0,points+case when actual_win then 50 else -40 end),
      updated_at=now()
  where id=u returning * into p;

  update public.match_queue
  set status='finished',
      finished_by=coalesce(finished_by,u),
      winner_id=winner,
      settled_by=array_append(coalesce(settled_by,'{}'::uuid[]),u)
  where room_id=p_room_id;

  return p;
end;
$$;

grant execute on function public.finish_match(uuid,boolean) to authenticated;
