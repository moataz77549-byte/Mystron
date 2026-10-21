-- Self-service uses the existing revocation store and active-admin predicate.
-- No Auth access/refresh token or other user's session is exposed.
create or replace function public.admin_my_sessions(p_page int default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare identity jsonb=public.admin_identity();result jsonb;
begin
 if not coalesce((identity->>'active')::boolean,false) or coalesce(identity->'permissions','{}'::jsonb)='{}'::jsonb then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'INVALID_INPUT';end if;
 with items as (
  select s.id,s.created_at,s.updated_at,s.not_after expires_at,s.aal,
   s.id=nullif(auth.jwt()->>'session_id','')::uuid is_current,r.revoked_at
  from auth.sessions s left join private.revoked_admin_sessions r on r.session_id=s.id
  where s.user_id=auth.uid() order by s.created_at desc,s.id limit 25 offset(p_page-1)*25
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(i) from items i),'[]'::jsonb),'total',(select count(*) from auth.sessions where user_id=auth.uid()),'page',p_page,'page_size',25) into result;
 return result;
end $$;
revoke all on function public.admin_my_sessions(int) from public,anon;
grant execute on function public.admin_my_sessions(int) to authenticated;

create or replace function public.admin_revoke_my_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb=public.admin_identity();changed int;
begin
 if not coalesce((identity->>'active')::boolean,false) or coalesce(identity->'permissions','{}'::jsonb)='{}'::jsonb then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_session=nullif(auth.jwt()->>'session_id','')::uuid then raise exception 'CURRENT_SESSION_USE_LOGOUT';end if;
 perform 1 from auth.sessions where id=p_session and user_id=auth.uid() for update;
 if not found then raise exception 'NOT_FOUND';end if;
 insert into private.revoked_admin_sessions(session_id,user_id) values(p_session,auth.uid()) on conflict do nothing;
 get diagnostics changed=row_count;
 if changed=1 then
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'OWN_SESSION_REVOKED','session',p_session::text);
 end if;
 return jsonb_build_object('revoked',true);
end $$;
revoke all on function public.admin_revoke_my_session(uuid) from public,anon;
grant execute on function public.admin_revoke_my_session(uuid) to authenticated;
