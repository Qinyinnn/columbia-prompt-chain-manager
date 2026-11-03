# Columbia Prompt Chain Manager

## Run a prompt chain

Chain execution uses the configured DeepSeek text model and records every run in the existing generation-history tables. Before enabling it:

1. Review and apply `supabase/migrations/20261102000000_manage_prompt_chain_steps.sql` for superadmin-guarded step CRUD and atomic reordering, then `supabase/migrations/20261102000100_prompt_chain_run_idempotency.sql` for retry idempotency. The latter permits unrestricted output length only for standalone keyed chain runs; existing mix-based Columbia Survival requests retain their 60-word limit.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key) for Supabase Auth.
3. Configure `SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY` in the server environment only. Do not expose either as a `NEXT_PUBLIC_` variable or commit their values.
4. Ensure the selected provider URL is HTTPS at `api.deepseek.com` and the model/provider are active with `{"text": true}` capability.

The Route Handler authorizes the current superadmin before creating the server-only service-role client. It runs steps in order, limits each provider request to 30 seconds, and supports up to eight steps per run. Deployment must support the Route Handler's configured 300-second maximum duration.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
