import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const ExpoSecureStoreAdapter = {
  getItem: (key:string) => SecureStore.getItemAsync(key),
  setItem: (key:string, value: string) => SecureStore.setItemAsync(key ,value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key)
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)



// import { Platform } from 'react-native'

// const ExpoSecureStoreAdapter = Platform.OS === 'web'
//   ? {
//       getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
//       setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
//       removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
//     }
//   : {
//       getItem: (key: string) => SecureStore.getItemAsync(key),
//       setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
//       removeItem: (key: string) => SecureStore.deleteItemAsync(key),
//     }