const config = window.SUPABASE_CONFIG || {};
const client = window.supabase && config.url && config.publishableKey
  ? window.supabase.createClient(config.url, config.publishableKey)
  : null;

const form = document.getElementById("forgotPasswordForm");
const email = document.getElementById("resetEmail");
const button = document.getElementById("resetButton");
const message = document.getElementById("resetMessage");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = "Sending...";
  message.textContent = "";
  message.className = "login-message";

  try {
    if (!client) throw new Error("Supabase is not configured.");

    const redirectTo = new URL("update-password.html", window.location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo });

    if (error) throw error;

    message.className = "login-message success";
    message.textContent = "If an account exists for this email, a password reset link has been sent.";
    form.reset();
  } catch (error) {
    message.textContent = error.message || "Unable to send the reset link.";
  } finally {
    button.disabled = false;
    button.textContent = "Send Reset Link";
  }
});