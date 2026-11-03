-- Review before applying. This migration is intentionally not executed here.
-- The authenticated role still passes the existing superadmin RLS policies.
grant select, update on table public.prompt_chain_definitions to authenticated;
grant insert, update, delete on table public.prompt_chain_steps to authenticated;

create or replace function public.manage_prompt_chain_step(
  p_operation text,
  p_chain_id uuid,
  p_step_id uuid default null,
  p_name text default null,
  p_system_prompt text default null,
  p_user_prompt_template text default null,
  p_model_id uuid default null,
  p_settings jsonb default '{}'::jsonb,
  p_expected_step_ids uuid[] default null,
  p_step_ids uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_locked_chain uuid;
  v_step_id uuid;
  v_current_ids uuid[];
  v_sorted_current_ids uuid[];
  v_sorted_requested_ids uuid[];
  v_count integer;
  v_max_order integer;
  v_base bigint;
  v_index integer;
  v_existing_order integer;
  v_deleted_order integer;
  v_history_count bigint;
begin
  if not coalesce(public.config_is_superadmin(), false) then
    raise exception 'Superadmin access is required.' using errcode = '42501';
  end if;

  if p_operation is null or p_operation not in ('create', 'update', 'delete', 'reorder') then
    raise exception 'Unsupported step operation.' using errcode = '22023';
  end if;

  -- Serialize every step mutation for a chain. All mutations through this
  -- function therefore see the preceding committed step order.
  select d.id into v_locked_chain
  from public.prompt_chain_definitions as d
  where d.id = p_chain_id
  for update;

  if v_locked_chain is null then
    raise exception 'Prompt chain not found.' using errcode = 'P0002';
  end if;

  if p_operation in ('create', 'update') then
    if p_name is null or length(trim(p_name)) = 0
       or p_system_prompt is null or length(trim(p_system_prompt)) = 0
       or p_user_prompt_template is null or length(trim(p_user_prompt_template)) = 0 then
      raise exception 'Step name and prompts must not be empty.' using errcode = '22023';
    end if;
    if p_model_id is null or not exists (
      select 1
      from public.llm_models as m
      join public.llm_providers as provider on provider.id = m.provider_id
      where m.id = p_model_id
        and m.is_active is true
        and provider.is_active is true
        and m.capabilities ->> 'text' = 'true'
    ) then
      raise exception 'Select an active model and provider whose capabilities declare text support.' using errcode = '22023';
    end if;
    if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
      raise exception 'Settings must be a JSON object.' using errcode = '22023';
    end if;
  end if;

  if p_operation = 'create' then
    select coalesce(array_agg(s.id order by s.step_order), array[]::uuid[]),
           coalesce(max(s.step_order), 0), count(*)::integer
    into v_current_ids, v_max_order, v_count
    from public.prompt_chain_steps as s
    where s.chain_id = p_chain_id;
    if v_count > 0 then
      v_base := v_max_order::bigint;
      if v_base + v_count > 2147483647 then
        raise exception 'There is not enough step-order range to compact this chain.' using errcode = '22003';
      end if;
      for v_index in 1..v_count loop
        update public.prompt_chain_steps as s
        set step_order = (v_base + v_index)::integer, updated_at = now()
        where s.id = v_current_ids[v_index] and s.chain_id = p_chain_id;
      end loop;
      for v_index in 1..v_count loop
        update public.prompt_chain_steps as s
        set step_order = v_index, updated_at = now()
        where s.id = v_current_ids[v_index] and s.chain_id = p_chain_id;
      end loop;
    end if;
    v_existing_order := v_count + 1;
    insert into public.prompt_chain_steps (
      chain_id, step_order, name, system_prompt, user_prompt_template, model_id, settings
    ) values (
      p_chain_id, v_existing_order, trim(p_name), p_system_prompt,
      p_user_prompt_template, p_model_id, p_settings
    ) returning id into v_step_id;
    return jsonb_build_object('step_id', v_step_id, 'step_order', v_existing_order);
  end if;

  if p_operation = 'update' then
    if p_step_id is null then
      raise exception 'Step id is required.' using errcode = '22023';
    end if;
    perform 1 from public.prompt_chain_steps as s
    where s.id = p_step_id and s.chain_id = p_chain_id
    for update;
    if not found then
      raise exception 'Step not found in this chain.' using errcode = 'P0002';
    end if;
    update public.prompt_chain_steps as s
    set name = trim(p_name),
        system_prompt = p_system_prompt,
        user_prompt_template = p_user_prompt_template,
        model_id = p_model_id,
        settings = p_settings,
        updated_at = now()
    where s.id = p_step_id and s.chain_id = p_chain_id;
    return jsonb_build_object('step_id', p_step_id);
  end if;

  if p_operation = 'delete' then
    if p_step_id is null then
      raise exception 'Step id is required.' using errcode = '22023';
    end if;
    select s.step_order into v_deleted_order
    from public.prompt_chain_steps as s
    where s.id = p_step_id and s.chain_id = p_chain_id
    for update;
    if not found then
      raise exception 'Step not found in this chain.' using errcode = 'P0002';
    end if;
    select count(*) into v_history_count
    from public.prompt_chain_step_runs as r
    where r.step_id = p_step_id;
    if v_history_count > 0 then
      raise exception 'This step has generation history and cannot be deleted. Deactivate its chain to preserve history.' using errcode = '23503';
    end if;
    delete from public.prompt_chain_steps as s
    where s.id = p_step_id and s.chain_id = p_chain_id;
    select coalesce(array_agg(s.id order by s.step_order), array[]::uuid[]),
           coalesce(max(s.step_order), 0), count(*)::integer
    into v_current_ids, v_max_order, v_count
    from public.prompt_chain_steps as s
    where s.chain_id = p_chain_id;
    if v_count > 0 then
      v_base := v_max_order::bigint;
      if v_base + v_count > 2147483647 then
        raise exception 'There is not enough step-order range to compact this chain.' using errcode = '22003';
      end if;
      for v_index in 1..v_count loop
        update public.prompt_chain_steps as s
        set step_order = (v_base + v_index)::integer, updated_at = now()
        where s.id = v_current_ids[v_index] and s.chain_id = p_chain_id;
      end loop;
      for v_index in 1..v_count loop
        update public.prompt_chain_steps as s
        set step_order = v_index, updated_at = now()
        where s.id = v_current_ids[v_index] and s.chain_id = p_chain_id;
      end loop;
    end if;
    return jsonb_build_object('deleted', true);
  end if;

  -- Reordering uses the complete current id sequence as an optimistic version.
  -- The row lock serializes calls, while this check rejects stale client orders.
  select coalesce(array_agg(s.id order by s.step_order), array[]::uuid[]),
         coalesce(max(s.step_order), 0), count(*)::integer
  into v_current_ids, v_max_order, v_count
  from public.prompt_chain_steps as s
  where s.chain_id = p_chain_id;

  if p_expected_step_ids is null or p_step_ids is null
     or p_expected_step_ids is distinct from v_current_ids then
    raise exception 'The step list changed. Refresh and try again.' using errcode = '40001';
  end if;

  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_sorted_current_ids from unnest(v_current_ids) as x(id);
  select coalesce(array_agg(x.id order by x.id), array[]::uuid[])
  into v_sorted_requested_ids from unnest(p_step_ids) as x(id);
  if cardinality(p_step_ids) <> v_count
     or v_sorted_current_ids is distinct from v_sorted_requested_ids then
    raise exception 'The reordered steps must contain every current step exactly once.' using errcode = '22023';
  end if;

  if v_count = 0 then
    return jsonb_build_object('step_ids', p_step_ids);
  end if;
  v_base := greatest(v_max_order, v_count)::bigint;
  if v_base + v_count > 2147483647 then
    raise exception 'There is not enough step-order range to reorder this chain.' using errcode = '22003';
  end if;

  -- First move every row to unique positive temporary positions above the
  -- existing maximum. Then assign the consecutive target positions.
  for v_index in 1..v_count loop
    update public.prompt_chain_steps as s
    set step_order = (v_base + v_index)::integer, updated_at = now()
    where s.id = v_current_ids[v_index] and s.chain_id = p_chain_id;
  end loop;
  for v_index in 1..v_count loop
    update public.prompt_chain_steps as s
    set step_order = v_index, updated_at = now()
    where s.id = p_step_ids[v_index] and s.chain_id = p_chain_id;
  end loop;

  return jsonb_build_object('step_ids', p_step_ids);
end;
$function$;

revoke all on function public.manage_prompt_chain_step(text, uuid, uuid, text, text, text, uuid, jsonb, uuid[], uuid[]) from public;
revoke all on function public.manage_prompt_chain_step(text, uuid, uuid, text, text, text, uuid, jsonb, uuid[], uuid[]) from anon;
grant execute on function public.manage_prompt_chain_step(text, uuid, uuid, text, text, text, uuid, jsonb, uuid[], uuid[]) to authenticated;
