const profileMessage = document.getElementById("profileMessage");
const passwordForm = document.getElementById("changePasswordForm");
const newPassword = document.getElementById("profileNewPassword");
const confirmPassword = document.getElementById("profileConfirmPassword");
const changeButton = document.getElementById("changePasswordButton");

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

async function loadProfile() {
  try {
    const session = await window.restaurantAuthReady;
    if (!session) return;

    const user = session.user;
    const email = user.email || "User";
    const role = window.RESTAURANT_ROLE || "Member";

    document.getElementById("profileEmail").textContent = email;
    document.getElementById("profileEmailDetail").textContent = email;
    document.getElementById("profileRole").textContent = role;
    document.getElementById("profileRoleDetail").textContent = role;
    document.getElementById("profileRestaurant").textContent = window.RESTAURANT_NAME || "Restaurant";
    document.getElementById("profileLastSignIn").textContent = formatDate(user.last_sign_in_at);
    document.getElementById("profileAvatar").textContent = email.charAt(0).toUpperCase();
  } catch (error) {
    profileMessage.textContent = error.message || "Unable to load profile.";
  }
}

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileMessage.textContent = "";
  profileMessage.className = "login-message";

  if (newPassword.value !== confirmPassword.value) {
    profileMessage.textContent = "Passwords do not match.";
    return;
  }

  if (newPassword.value.length < 8) {
    profileMessage.textContent = "Password must be at least 8 characters.";
    return;
  }

  changeButton.disabled = true;
  changeButton.textContent = "Updating...";

  try {
    const session = await window.restaurantAuthReady;
    if (!session || !window.SUPABASE_CLIENT) throw new Error("Your session has expired. Please sign in again.");

    const { error } = await window.SUPABASE_CLIENT.auth.updateUser({
      password: newPassword.value
    });

    if (error) throw error;

    profileMessage.className = "login-message success";
    profileMessage.textContent = "Password updated successfully.";
    passwordForm.reset();
  } catch (error) {
    profileMessage.textContent = error.message || "Unable to update the password.";
  } finally {
    changeButton.disabled = false;
    changeButton.textContent = "Update Password";
  }
});

loadProfile();