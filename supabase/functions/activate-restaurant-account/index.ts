import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !publishableKey || !secretKey) return json({ error: "Function secrets are not configured." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const userClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminClient = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const userId = (await userClient.auth.getUser(authHeader.replace("Bearer ", ""))).data.user?.id;
  if (!userId) return json({ error: "Invalid authentication session." }, 401);

  const { data: member, error: memberError } = await adminClient.from("restaurant_members")
    .select("restaurant_id,role,is_active").eq("user_id", userId).maybeSingle();
  if (memberError || !member || !member.is_active) return json({ error: "Restaurant membership was not found." }, 403);

  const now = new Date().toISOString();
  const { error: restaurantError } = await adminClient.from("restaurants")
    .update({ status: "active", activated_at: now }).eq("id", member.restaurant_id);
  if (restaurantError) return json({ error: restaurantError.message }, 400);

  const { error: updateMemberError } = await adminClient.from("restaurant_members")
    .update({ activated_at: now }).eq("user_id", userId);
  if (updateMemberError) return json({ error: updateMemberError.message }, 400);

  return json({ success: true, status: "active" });
});
