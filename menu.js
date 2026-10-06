const MENU_STORAGE_KEY = "restaurantMenu";
const DEFAULT_MENU = [
  { id: 1, name: "Chicken Biriyani", category: "Main Course", price: 180, food_type: "non_veg" },
  { id: 2, name: "Mutton Biriyani", category: "Main Course", price: 240, food_type: "non_veg" },
  { id: 3, name: "Fish Curry", category: "Main Course", price: 150, food_type: "non_veg" },
  { id: 4, name: "Chicken 65", category: "Starters", price: 140, food_type: "non_veg" },
  { id: 5, name: "Paneer 65", category: "Starters", price: 130, food_type: "veg" },
  { id: 6, name: "Veg Meals", category: "Meals", price: 120, food_type: "veg" },
  { id: 7, name: "Parotta", category: "Breads", price: 25, food_type: "veg" },
  { id: 8, name: "Chapati", category: "Breads", price: 30, food_type: "veg" },
  { id: 9, name: "Curd Rice", category: "Meals", price: 80, food_type: "veg" },
  { id: 10, name: "Fresh Lime", category: "Drinks", price: 50, food_type: "veg" },
  { id: 11, name: "Coke", category: "Drinks", price: 40, food_type: "veg" },
  { id: 12, name: "Water Bottle", category: "Drinks", price: 20, food_type: "veg" }
];

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.SUPABASE_CLIENT || null;

const $ = (id) => document.getElementById(id);
let menu = [];

function localMenu() {
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch (error) {
    console.warn("Unable to load saved local menu.", error);
  }
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(DEFAULT_MENU));
  return [...DEFAULT_MENU];
}

async function loadMenu() {
  if (!supabaseClient) return localMenu();

  const { data, error } = await supabaseClient
    .from("menu_items")
    .select("id,name,category,price,food_type,is_active")
    .eq("restaurant_id", window.RESTAURANT_ID)
    .order("name");

  if (error) {
    console.error("Supabase menu load failed.", error);
    return [];
  }

  const remoteMenu = (data || []).filter((item) => item.is_active).map((item) => ({
    ...item,
    price: Number(item.price)
  }));

  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(remoteMenu));
  return remoteMenu;
}

function saveLocalMenu() {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menu));
}

async function saveMenuItem(item) {
  if (!supabaseClient) {
    saveLocalMenu();
    return true;
  }

  const payload = {
    restaurant_id: window.RESTAURANT_ID,
    name: item.name,
    category: item.category,
    price: item.price,
    food_type: item.food_type,
    is_active: true
  };

  let result;
  if (item.id) {
    result = await supabaseClient
      .from("menu_items")
      .update(payload)
      .eq("id", item.id)
      .eq("restaurant_id", window.RESTAURANT_ID)
      .select("id,name,category,price,food_type,is_active")
      .single();
  } else {
    result = await supabaseClient
      .from("menu_items")
      .insert(payload)
      .select("id,name,category,price,food_type,is_active")
      .single();
  }

  if (result.error) {
    console.error("Supabase menu save failed.", result.error);
    alert(`Unable to save menu item: ${result.error.message}`);
    return false;
  }

  return true;
}

async function deleteMenuItem(id) {
  if (!supabaseClient) {
    menu = menu.filter((entry) => entry.id !== id);
    saveLocalMenu();
    return true;
  }

  const { error } = await supabaseClient
    .from("menu_items")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    console.error("Supabase menu delete failed.", error);
    alert(`Unable to delete menu item: ${error.message}`);
    return false;
  }

  return true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categories() {
  return [...new Set(menu.map((item) => item.category).filter(Boolean))].sort();
}

function renderFilters() {
  const selected = $("categoryFilter").value;
  $("categoryFilter").innerHTML = '<option value="">All categories</option>' +
    categories().map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  $("categoryFilter").value = categories().includes(selected) ? selected : "";

  $("categoryOptions").innerHTML = categories()
    .map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");
}

function renderTable() {
  const query = $("menuSearch").value.trim().toLowerCase();
  const category = $("categoryFilter").value;

  const items = menu.filter((item) => {
    const matchesSearch = !query || item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    const matchesCategory = !category || item.category === category;
    return matchesSearch && matchesCategory;
  });

  $("menuTable").innerHTML = items.length ? `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Category</th>
          <th>Food Type</th>\n          <th>Price</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>
              <div class="managed-item">
                <span class="managed-icon" title="${item.food_type === "non_veg" ? "Non-Veg" : "Veg"}">${item.food_type === "non_veg" ? "🔴" : "🟢"}</span>
                <strong>${escapeHtml(item.name)}</strong>
              </div>
            </td>
            <td>${escapeHtml(item.category)}</td>
            <td><strong>₹${Number(item.price).toFixed(2)}</strong></td>
            <td>
              <div class="table-actions">
                <button class="action-btn" data-action="edit" data-id="${item.id}">Edit</button>
                <button class="action-btn danger" data-action="delete" data-id="${item.id}">Delete</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : '<div class="empty-management"><div class="empty-icon">🍽️</div><strong>No menu items found</strong><span>Add a new item or change your search.</span></div>';

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.id);
      if (button.dataset.action === "edit") openEditItem(id);
      if (button.dataset.action === "delete") deleteItem(id);
    });
  });
}

function openAddItem() {
  $("itemForm").reset();
  $("itemId").value = "";
  $("itemModalTitle").textContent = "Add New Item";
  $("itemFoodType").value = "veg";
  $("itemModal").classList.remove("hidden");
  $("itemName").focus();
}

function openEditItem(id) {
  const item = menu.find((entry) => entry.id === id);
  if (!item) return;

  $("itemId").value = String(item.id);
  $("itemName").value = item.name;
  $("itemCategory").value = item.category;
  $("itemPrice").value = item.price;
  $("itemFoodType").value = item.food_type || "veg";
  $("itemModalTitle").textContent = "Edit Menu Item";
  $("itemModal").classList.remove("hidden");
  $("itemName").focus();
}

function closeModal() {
  $("itemModal").classList.add("hidden");
}

async function saveItem(event) {
  event.preventDefault();

  const id = Number($("itemId").value);
  const name = $("itemName").value.trim();
  const category = $("itemCategory").value.trim();
  const price = Number($("itemPrice").value);
  const food_type = $("itemFoodType").value;

  if (!name || !category || !Number.isFinite(price) || price <= 0) {
    alert("Please enter a valid item name, category and price.");
    return;
  }

  const item = { id: id || null, name, category, price, food_type };
  const saved = await saveMenuItem(item);
  if (!saved) return;

  if (id) {
    const existing = menu.find((entry) => entry.id === id);
    if (existing) Object.assign(existing, item);
  } else if (supabaseClient) {
    menu = await loadMenu();
  } else {
    const nextId = menu.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;
    menu.push({ ...item, id: nextId });
  }

  if (!supabaseClient) saveLocalMenu();
  renderFilters();
  renderTable();
  closeModal();
}

async function deleteItem(id) {
  const item = menu.find((entry) => entry.id === id);
  if (!item) return;

  const confirmed = window.confirm(
    `Delete "${item.name}" from the menu? It will no longer appear on the billing screen.`
  );
  if (!confirmed) return;

  const deleted = await deleteMenuItem(id);
  if (!deleted) return;

  menu = menu.filter((entry) => entry.id !== id);
  if (!supabaseClient) saveLocalMenu();
  renderFilters();
  renderTable();
}

async function initialize() {
  $("menuTable").innerHTML = '<div class="empty-management"><strong>Loading menu...</strong><span>Connecting to the restaurant database.</span></div>';
  menu = await loadMenu();
  renderFilters();
  renderTable();
  subscribeToMenuChanges();
}

function subscribeToMenuChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("restaurant-menu-management")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "menu_items" },
      async () => {
        menu = await loadMenu();
        renderFilters();
        renderTable();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Supabase Realtime menu subscription failed.");
      }
    });
}

$("addItemBtn").addEventListener("click", openAddItem);
$("itemForm").addEventListener("submit", saveItem);
$("cancelItemBtn").addEventListener("click", closeModal);
$("closeItemModalBtn").addEventListener("click", closeModal);
$("menuSearch").addEventListener("input", renderTable);
$("categoryFilter").addEventListener("change", renderTable);
$("itemModal").addEventListener("click", (event) => {
  if (event.target === $("itemModal")) closeModal();
});

window.restaurantAuthReady
  .then((session) => {
    if (session) initialize();
  })
  .catch((error) => {
    console.error("Authentication initialization failed.", error);
    alert(error.message || "Unable to initialize authentication.");
  });