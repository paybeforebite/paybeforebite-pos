const config = window.SUPABASE_CONFIG || {};
const client =
  window.supabase && config.url && config.publishableKey
    ? window.supabase.createClient(config.url, config.publishableKey)
    : null;

window.SUPABASE_CLIENT = client;

const RESTAURANT_PAGES = [
  "dashboard.html",
  "billing.html",
  "tables.html",
  "menu.html",
  "restaurant-customers.html",
  "staff.html",
  "reports.html",
  "profile.html",
  "subscription.html"
];

const OWNER_ADMIN_PAGES = [
  "menu.html",
  "restaurant-customers.html",
  "staff.html",
  "subscription.html"
];

function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function redirectToLogin() {
  const page = currentPage();
  if (page === "index.html") return;

  const next = RESTAURANT_PAGES.includes(page) ? page : "dashboard.html";
  sessionStorage.setItem("paybeforebite_requested_page", next);
  window.location.replace("index.html");
}

async function denyRouteAccess() {
  if (client) {
    try {
      await client.auth.signOut();
    } catch (_) {
      // Continue redirecting even if the remote sign-out request fails.
    }
  }
  sessionStorage.removeItem("paybeforebite_requested_page");
  window.location.replace("index.html");
}

async function loadRestaurantSession() {
  if (!client) throw new Error("Supabase is not configured.");

  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;

  if (!session) {
    redirectToLogin();
    return null;
  }

  const { data: member, error: memberError } = await client
    .from("restaurant_members")
    .select("restaurant_id,role,restaurants(name,slug)")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (memberError) throw memberError;

  if (!member) {
    await denyRouteAccess();
    return null;
  }

  window.RESTAURANT_ID = member.restaurant_id;
  window.RESTAURANT_ROLE = String(member.role || "").trim().toLowerCase();
  window.RESTAURANT_NAME = member.restaurants?.name || "Restaurant";

  document.querySelectorAll("[data-user-email]").forEach((element) => {
    element.textContent = session.user.email || "";
  });
  document.querySelectorAll("[data-restaurant-name]").forEach((element) => {
    element.textContent = window.RESTAURANT_NAME;
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    if (button.dataset.logoutBound === "true") return;
    button.dataset.logoutBound = "true";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) throw signOutError;
      } finally {
        window.location.replace("index.html");
      }
    });
  });

  const page = currentPage();
  if (
    RESTAURANT_PAGES.includes(page) &&
    OWNER_ADMIN_PAGES.includes(page) &&
    !["owner", "admin"].includes(window.RESTAURANT_ROLE)
  ) {
    await denyRouteAccess();
    return null;
  }

  return session;
}

window.restaurantAuthReady = loadRestaurantSession();
