-- Review before applying. This migration adds standalone chain-run idempotency
-- without changing the existing mix-based Columbia Survival generation flow.

alter table public.generation_requests
  add column idempotency_key uuid;

create unique index generation_requests_user_idempotency_key_unique
  on public.generation_requests(user_id, idempotency_key)
  where user_id is not null and idempotency_key is not null;

alter table public.generation_requests
  drop constraint generation_requests_succeeded_output_valid;

alter table public.generation_requests
  add constraint generation_requests_succeeded_output_valid check (
    status <> 'succeeded'
    or (
      title is not null and length(trim(title)) > 0
      and content is not null and length(trim(content)) > 0
      and (
        (mix_id is null and idempotency_key is not null)
        or array_length(regexp_split_to_array(trim(content), E'\\s+'), 1) <= 60
      )
    )
  );

comment on column public.generation_requests.idempotency_key is
  'Optional client-generated key for safely deduplicating standalone prompt-chain execution retries.';
