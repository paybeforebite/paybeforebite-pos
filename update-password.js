const config = window.SUPABASE_CONFIG || {};
const client = window.supabase && config.url && config.publishableKey
  ? window.supabase.createClient(config.url, config.publishableKey)
  : null;

const form = document.getElementById("updatePasswordForm");
const password = document.getElementById("newPassword");
const confirmPassword = document.getElementById("confirmPassword");
const button = document.getElementById("updatePasswordButton");
const message = document.getElementById("updatePasswordMessage");

async function hasRecoverySession() {
  if (!client) return false;
  const { data } = await client.auth.getSession();
  return Boolean(data.session);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.className = "login-message";

  if (password.value !== confirmPassword.value) {
    message.textContent = "Passwords do not match.";
    return;
  }

  if (password.value.length < 8) {
    message.textContent = "Password must be at least 8 characters.";
    return;
  }

  button.disabled = true;
  button.textContent = "Updating...";

  try {
    if (!client) throw new Error("Supabase is not configured.");
    if (!(await hasRecoverySession())) {
      throw new Error("This reset link is invalid or has expired. Please request a new link.");
    }

    const { error } = await client.auth.updateUser({ password: password.value });
    if (error) throw error;

    const { error: activationError } = await client.functions.invoke("activate-restaurant-account");
    if (activationError) {
      console.warn("Password updated, but restaurant activation could not be completed.", activationError);
    }

    message.className = "login-message success";
    message.textContent = "Password updated successfully. Redirecting to sign in...";
    form.reset();
    setTimeout(() => window.location.replace("index.html"), 1200);
  } catch (error) {
    message.textContent = error.message || "Unable to update the password.";
  } finally {
    button.disabled = false;
    button.textContent = "Update Password";
  }
});