import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const userId = process.argv[2];
const { data, error } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", userId)
  .single();
console.log(error || JSON.stringify(data, null, 2));
