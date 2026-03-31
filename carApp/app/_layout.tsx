/* 
root layout — it wraps the entire app.

It's where your onAuthStateChange() listener lives, which fires on app load, checks Supabase for an existing session, and then populates auth.ts with the session and user. Based on what it finds, it decides whether to send the user to (auth)/sign-in.tsx or (tabs)/ — that's the core navigation gate for the whole app
*/

