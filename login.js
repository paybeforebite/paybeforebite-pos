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
  "platform-dashboard.html",
  "customers.html",
  "subscriptions.html",
  "analytics.html",
  "settings.html",
  "index.html",
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
const nextPage = requestedNext || "index.html";

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  message.textContent = "";

  try {
    if (!client) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    if (error) {
      throw error;
    }

    if (requestedNext) {
      sessionStorage.removeItem("paybeforebite_requested_page");
      window.location.replace(nextPage);
      return;
    }

    const { data: platformAdmin, error: platformError } = await client
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (platformError) {
      throw platformError;
    }

    window.location.replace(
      platformAdmin ? "platform-dashboard.html" : "dashboard.html"
    );
  } catch (error) {
    message.textContent = error?.message || "Unable to sign in.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
});
