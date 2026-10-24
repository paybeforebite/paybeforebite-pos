import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://app.paybeforebite.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : "https://app.paybeforebite.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: "Origin is not allowed." }, 403, origin);
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !publishableKey || !secretKey) {
    return json({ error: "Function secrets are not configured." }, 500, origin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401, origin);
  }

  const userClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(
    authHeader.slice("Bearer ".length),
  );
  const userId = authData.user?.id;
  if (authError || !userId) {
    return json({ error: "Invalid authentication session." }, 401, origin);
  }

  const { data: member, error: memberError } = await adminClient
    .from("restaurant_members")
    .select("restaurant_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    console.error("Restaurant membership lookup failed.", memberError);
    return json({ error: "Unable to verify restaurant membership." }, 500, origin);
  }
  if (!member || !member.is_active || member.role !== "owner") {
    return json({ error: "Active restaurant owner membership is required." }, 403, origin);
  }

  const now = new Date().toISOString();
  const { error: restaurantError } = await adminClient
    .from("restaurants")
    .update({ status: "active", activated_at: now })
    .eq("id", member.restaurant_id);

  if (restaurantError) {
    console.error("Restaurant activation failed.", restaurantError);
    return json({ error: "Unable to activate the restaurant." }, 500, origin);
  }

  const { error: updateMemberError } = await adminClient
    .from("restaurant_members")
    .update({ activated_at: now })
    .eq("user_id", userId)
    .eq("restaurant_id", member.restaurant_id);

  if (updateMemberError) {
    console.error("Restaurant member activation timestamp update failed.", updateMemberError);
    return json({
      error: "Restaurant activation completed, but member activation timestamp could not be updated.",
    }, 500, origin);
  }

  return json({ success: true, status: "active" }, 200, origin);
});
