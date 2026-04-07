//sign-in.tsx will call functions from this file

import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './client'

WebBrowser.maybeCompleteAuthSession()

