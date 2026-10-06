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

const MENU_STORAGE_KEY = "restaurantMenu";
const INVOICE_SEQUENCE_KEY = "restaurantInvoiceSequence";
const CURRENT_INVOICE_KEY = "restaurantCurrentInvoiceNumber";
const TAX_RATE = 0.05;
const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.SUPABASE_CLIENT || null;

let menu = [];
let cart = [];
let activeCategory = "All";
let invoiceSequence = Number(localStorage.getItem(INVOICE_SEQUENCE_KEY) || "0");
let invoiceSaved = false;

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2
}).format(value);

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
  if (!supabaseClient) {
    return localMenu();
  }

  const { data, error } = await supabaseClient
    .from("menu_items")
    .select("id,name,category,price,food_type")
    .eq("restaurant_id", window.RESTAURANT_ID)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Supabase menu load failed.", error);
    return [];
  }

  const remoteMenu = (data || []).map((item) => ({
    ...item,
    price: Number(item.price)
  }));

  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(remoteMenu));
  return remoteMenu;
}

function nextInvoiceNumber() {
  invoiceSequence += 1;
  localStorage.setItem(INVOICE_SEQUENCE_KEY, String(invoiceSequence));

  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(invoiceSequence).padStart(3, "0")}`;
  localStorage.setItem(CURRENT_INVOICE_KEY, invoiceNumber);

  return invoiceNumber;
}

function getCurrentInvoiceNumber() {
  const savedInvoiceNumber = localStorage.getItem(CURRENT_INVOICE_KEY);

  if (savedInvoiceNumber) {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    if (savedInvoiceNumber.startsWith(`INV-${today}-`)) {
      return savedInvoiceNumber;
    }
  }

  return nextInvoiceNumber();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let currentInvoiceNumber = getCurrentInvoiceNumber();
$("invoiceNumber").textContent = currentInvoiceNumber;

function foodTypeIcon(foodType) {
  return foodType === "non_veg" ? "🔴" : "🟢";
}

function foodTypeLabel(foodType) {
  return foodType === "non_veg" ? "Non-Veg" : "Veg";
}

function renderCategories() {
  const categories = ["All", ...new Set(menu.map((item) => item.category))];
  if (!categories.includes(activeCategory)) activeCategory = "All";

  $("categoryTabs").innerHTML = categories.map((category) => `
    <button class="category-btn ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");

  document.querySelectorAll(".category-btn").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderCategories();
      renderMenu();
    });
  });
}

function renderMenu() {
  const query = $("searchInput").value.trim().toLowerCase();
  const items = menu.filter((item) => {
    const categoryMatch = activeCategory === "All" || item.category === activeCategory;
    const searchMatch = !query || item.name.toLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });

  $("menuGrid").innerHTML = items.length
    ? items.map((item) => `
      <button class="menu-card" data-id="${item.id}" type="button">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="category">${foodTypeIcon(item.food_type)} ${foodTypeLabel(item.food_type)} · ${escapeHtml(item.category)}</div>
        <div class="price">${money(item.price)}</div>
      </button>
    `).join("")
    : '<div class="empty-cart"><strong>No items found</strong><span>Try another search or add a menu item.</span></div>';

  document.querySelectorAll(".menu-card").forEach((card) => {
    card.addEventListener("click", () => addToCart(Number(card.dataset.id)));
  });
}

function addToCart(id) {
  const item = menu.find((entry) => entry.id === id);
  if (!item) return;

  const existing = cart.find((entry) => entry.id === id);
  if (existing) existing.qty += 1;
  else cart.push({ ...item, qty: 1 });
  renderCart();
}

function changeQuantity(id, delta) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((entry) => entry.id !== id);
  renderCart();
}

function totals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * TAX_RATE;
  return { subtotal, tax, total: subtotal + tax };
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  $("cartCount").textContent = `${count} item${count === 1 ? "" : "s"}`;

  $("cartItems").innerHTML = cart.length
    ? cart.map((item) => `
      <div class="cart-line">
        <div class="cart-line-main">
          <div><h3>${escapeHtml(item.name)}</h3><span class="rate">${money(item.price)} each</span></div>
          <strong>${money(item.price * item.qty)}</strong>
        </div>
        <div class="quantity">
          <button class="qty-btn" data-id="${item.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-id="${item.id}" data-delta="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
    `).join("")
    : '<div class="empty-cart"><div class="empty-icon">🛒</div><strong>Your cart is empty</strong><span>Add food items from the menu.</span></div>';

  document.querySelectorAll(".qty-btn").forEach((button) => {
    button.addEventListener("click", () => changeQuantity(Number(button.dataset.id), Number(button.dataset.delta)));
  });

  const { subtotal, tax, total } = totals();
  $("subtotal").textContent = money(subtotal);
  $("tax").textContent = money(tax);
  $("total").textContent = money(total);
  $("generateInvoiceBtn").disabled = cart.length === 0;
}

async function saveInvoiceToSupabase(customer, subtotal, tax, total) {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured. Invoice cannot be stored in the database.");
  }

  const invoiceItems = cart.map((item) => ({
    menu_item_id: item.id,
    item_name: item.name,
    quantity: item.qty,
    unit_price: item.price,
    line_total: Number((item.price * item.qty).toFixed(2)),
    food_type: item.food_type
  }));

  const { data: invoice, error } = await supabaseClient.rpc("create_invoice_with_items", {
    p_invoice_number: currentInvoiceNumber,
    p_customer_name: customer,
    p_subtotal: subtotal,
    p_tax: tax,
    p_total: total,
    p_items: invoiceItems
  });

  if (error) {
    throw error;
  }

  return invoice;
}

async function generateInvoice() {
  if (!cart.length || invoiceSaved) return;

  const { subtotal, tax, total } = totals();
  const customer = $("customerName").value.trim() || "Walk-in Customer";
  const generateButton = $("generateInvoiceBtn");

  generateButton.disabled = true;
  generateButton.textContent = "Saving Invoice...";

  try {
    let invoiceDate = new Date();

    if (supabaseClient) {
      const invoice = await saveInvoiceToSupabase(customer, subtotal, tax, total);
      invoiceDate = new Date(invoice.invoice_date);
    } else {
      throw new Error("Supabase is not configured. Please configure supabase-config.js before generating an invoice.");
    }

    invoiceSaved = true;

    $("printInvoiceNumber").textContent = currentInvoiceNumber;
    $("invoiceDate").textContent = invoiceDate.toLocaleString("en-IN", {
      dateStyle: "medium", timeStyle: "short"
    });
    $("printCustomerName").textContent = customer;
    $("invoiceLines").innerHTML = cart.map((item) => `
      <tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${money(item.price)}</td><td>${money(item.price * item.qty)}</td></tr>
    `).join("");
    $("printSubtotal").textContent = money(subtotal);
    $("printTax").textContent = money(tax);
    $("printTotal").textContent = money(total);
    $("invoiceModal").classList.remove("hidden");
  } catch (error) {
    console.error("Invoice save failed.", error);
    alert(`Unable to save invoice: ${error.message}`);
  } finally {
    generateButton.textContent = "Generate Invoice";
    renderCart();
  }
}

function newBill() {
  cart = [];
  $("customerName").value = "";
  currentInvoiceNumber = nextInvoiceNumber();
  invoiceSaved = false;
  $("invoiceNumber").textContent = currentInvoiceNumber;
  renderCart();
  $("invoiceModal").classList.add("hidden");
}

async function initialize() {
  $("menuGrid").innerHTML = '<div class="empty-cart"><strong>Loading menu...</strong><span>Connecting to the restaurant database.</span></div>';
  menu = await loadMenu();
  renderCategories();
  renderMenu();
  renderCart();
  subscribeToMenuChanges();
}

function subscribeToMenuChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("restaurant-menu-billing")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "menu_items" },
      async () => {
        menu = await loadMenu();
        renderCategories();
        renderMenu();
        cart = cart.filter((cartItem) =>
          menu.some((menuItem) => menuItem.id === cartItem.id)
        );
        renderCart();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Supabase Realtime menu subscription failed.");
      }
    });
}

$("searchInput").addEventListener("input", renderMenu);
$("generateInvoiceBtn").addEventListener("click", generateInvoice);
$("printInvoiceBtn").addEventListener("click", () => window.print());
$("closeModalBtn").addEventListener("click", () => $("invoiceModal").classList.add("hidden"));
$("clearCartBtn").addEventListener("click", () => { cart = []; renderCart(); });
$("newBillBtn").addEventListener("click", newBill);
$("invoiceModal").addEventListener("click", (event) => {
  if (event.target === $("invoiceModal")) $("invoiceModal").classList.add("hidden");
});

window.addEventListener("storage", async (event) => {
  if (event.key !== MENU_STORAGE_KEY || supabaseClient) return;
  menu = localMenu();
  renderCategories();
  renderMenu();
  cart = cart.filter((cartItem) => menu.some((menuItem) => menuItem.id === cartItem.id));
  renderCart();
});

window.restaurantAuthReady
  .then((session) => {
    if (session) initialize();
  })
  .catch((error) => {
    console.error("Authentication initialization failed.", error);
    alert(error.message || "Unable to initialize authentication.");
  });