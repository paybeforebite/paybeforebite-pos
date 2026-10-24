const config = window.SUPABASE_CONFIG || {};
const client =
  window.supabase && config.url && config.publishableKey
    ? window.supabase.createClient(config.url, config.publishableKey)
    : null;

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("loginEmail");
const passwordInput = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");

const allowedNext = [
  "dashboard.html",
  "billing.html",
  "menu.html",
  "restaurant-customers.html",
  "staff.html",
  "reports.html",
  "profile.html",
  "subscription.html"
];

const storedNext = sessionStorage.getItem("paybeforebite_requested_page");
const requestedNext = allowedNext.includes(storedNext) ? storedNext : null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  message.textContent = "";

  try {
    if (!client) throw new Error("Supabase is not configured.");

    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) throw error;

    const { data: member, error: memberError } = await client
      .from("restaurant_members")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) {
      await client.auth.signOut();
      throw new Error("This account does not have an active restaurant membership. Contact your restaurant owner.");
    }

    sessionStorage.removeItem("paybeforebite_requested_page");
    const destination = requestedNext &&
      (!["menu.html", "restaurant-customers.html", "staff.html", "subscription.html"].includes(requestedNext) ||
       ["owner", "admin"].includes(String(member.role || "").trim().toLowerCase()))
      ? requestedNext
      : "dashboard.html";

    window.location.replace(destination);
  } catch (error) {
    message.textContent = error?.message || "Unable to sign in.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});
