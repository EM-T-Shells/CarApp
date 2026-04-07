Still needs doing before you write a single line of code:

     Create the Stabl repo on GitHub and initialize main → dev branches manually 
     Scaffold the folder structure — create the directories manually before Claude Code touches anything
     .env file — EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, Stripe publishable key, Google Maps API key, Firebase config, Anthropic API key
     .claudeignore — carry over from CarApp  and update the project name references
     Supabase project — create a new project, run schema_policies.sql, then generate types: supabase gen types typescript --project-id <id> > src/types/supabase.ts
     Firebase project — create it and download the google-services.json (Android) and GoogleService-Info.plist (iOS) before FCM will work

