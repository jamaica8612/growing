-- The shared auth.users table has one INSERT trigger per app, so every signup in
-- the recipe app or rn app also auto-created a quickflex_profiles row that showed
-- up in QuickFlex's pending-approval list. QuickFlex does not need this trigger:
-- the app self-provisions a profile on first QuickFlex login via the
-- quickflex_ensure_profile RPC (see loadProfile in src/main.js). Remove the
-- QuickFlex trigger and its function so other apps' signups no longer leak into
-- QuickFlex. The recipe (handle_new_user) and rn (rn_handle_new_user) triggers
-- are intentionally left untouched.
drop trigger if exists quickflex_handle_new_auth_user_trigger on auth.users;
drop function if exists public.quickflex_handle_new_auth_user();;
