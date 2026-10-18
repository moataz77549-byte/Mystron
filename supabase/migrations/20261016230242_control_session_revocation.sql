create or replace function public.admin_revoke_session(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform private.require_permission('security.manage');
 if p_session=nullif(auth.jwt()->>'session_id','')::uuid then raise exception 'CURRENT_SESSION_USE_LOGOUT';end if;
 select s.user_id into target from auth.sessions s join public.admin_memberships m on m.user_id=s.user_id where s.id=p_session;if not found then raise exception 'NOT_FOUND';end if;
 insert into private.revoked_admin_sessions(session_id,user_id) values(p_session,target) on conflict do nothing;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'SESSION_REVOKED','session',p_session::text);
 insert into public.security_events(actor_id,event_type,result) values(auth.uid(),'SESSION_REVOKED','success');
end $$;
revoke all on function public.admin_revoke_session(uuid) from public,anon;grant execute on function public.admin_revoke_session(uuid) to authenticated;
