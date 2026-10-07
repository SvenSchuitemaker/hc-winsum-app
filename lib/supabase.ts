import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase =
    supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey, {
            auth: {
                storage: AsyncStorage,
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false,
            },
        })
        : null;