import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ftpcjyecegugofftcoco.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "YeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0cGNqeWVjZWd1Z29mZnRjb2NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTMyNjcsImV4cCI6MjEwNjUyOTI2N30.SuT6ir8EMKmLgC2gAIsbDEr95XPEv-ic4RRCmmfbnec";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);