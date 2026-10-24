const db = window.SUPABASE_CLIENT;
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));

let tables = [];
let openOrders = [];
let menu = [];
let orderItems = [];
let currentOrder = null;
let mode = "dine_in";
let busy = false;

function setBusy(value) {
  busy = value;
  ["addTableBtn","refreshBtn","addItemBtn","saveOrderBtn","settleBtn","dineInMode","takeawayMode"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = value;
  });
  updateActions();
}

function notify(message) {
  $("orderNotice").textContent = message;
  $("orderNotice").hidden = false;
}

function clearNotice() {
  $("orderNotice").hidden = true;
  $("orderNotice").textContent = "";
}

function updateActions() {
  const hasOrder = Boolean(currentOrder && currentOrder.status === "open");
  const hasItems = orderItems.length > 0;
  $("addItemBtn").disabled = busy || !hasOrder || !$("menuSelect").value;
  $("saveOrderBtn").disabled = busy || !hasOrder;
  $("settleBtn").disabled = busy || !hasOrder || !hasItems;
  $("customerName").disabled = busy || !hasOrder;
  $("paymentMethod").disabled = busy || !hasOrder;
}

async function runQuery(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

async function loadAll() {
  if (!db || !window.RESTAURANT_ID) throw new Error("Restaurant session is not ready. Please sign in again.");
  const [tableRows, orderRows, menuRows] = await Promise.all([
    runQuery(db.from("restaurant_tables").select("id,table_number,capacity,is_reserved").eq("restaurant_id", window.RESTAURANT_ID).order("table_number")),
    runQuery(db.from("table_orders").select("id,table_id,order_type,status,customer_name,created_at,invoice_id").eq("restaurant_id", window.RESTAURANT_ID).eq("status", "open").order("created_at", { ascending: false })),
    runQuery(db.from("menu_items").select("id,name,category,price,food_type").eq("restaurant_id", window.RESTAURANT_ID).eq("is_active", true).order("name"))
  ]);
  tables = tableRows || [];
  openOrders = orderRows || [];
  menu = (menuRows || []).map((item) => ({ ...item, price: Number(item.price) }));
  renderMenuSelect();
  renderFloor();
  if (currentOrder) {
    const stillOpen = openOrders.find((order) => order.id === currentOrder.id);
    if (!stillOpen) {
      currentOrder = null;
      orderItems = [];
      renderOrder();
    }
  }
}

function renderMenuSelect() {
  $("menuSelect").innerHTML = '<option value="">Select menu item…</option>' + menu.map((item) =>
    '<option value="' + safe(item.id) + '">' + safe(item.name) + ' · ' + money(item.price) + '</option>'
  ).join("");
  updateActions();
}

function orderForTable(tableId) {
  return openOrders.find((order) => order.order_type === "dine_in" && order.table_id === tableId);
}

function renderFloor() {
  $("dineInMode").classList.toggle("active", mode === "dine_in");
  $("takeawayMode").classList.toggle("active", mode === "takeaway");
  $("addTableBtn").hidden = mode !== "dine_in";

  if (mode === "takeaway") {
    const takeawayOrders = openOrders.filter((order) => order.order_type === "takeaway");
    $("tableSummary").textContent = takeawayOrders.length + " open takeaway order" + (takeawayOrders.length === 1 ? "" : "s");
    $("tableGrid").innerHTML = '<button type="button" class="table-tile" id="newTakeawayTile"><strong>＋ New Takeaway</strong><span class="status available">Start order</span><small>Create a new takeaway bill</small></button>' +
      takeawayOrders.map((order) => '<button type="button" class="table-tile" data-open-order="' + safe(order.id) + '"><strong>Takeaway</strong><span class="status occupied">Open</span><small>' + safe(order.customer_name || "Walk-in Customer") + '</small><small>' + new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + '</small></button>').join("");
    $("newTakeawayTile").addEventListener("click", () => startOrder("takeaway", null));
    document.querySelectorAll("[data-open-order]").forEach((button) => button.addEventListener("click", () => selectOrder(button.dataset.openOrder)));
    return;
  }

  const occupied = tables.filter((table) => orderForTable(table.id)).length;
  const reserved = tables.filter((table) => table.is_reserved && !orderForTable(table.id)).length;
  $("tableSummary").textContent = tables.length + " tables · " + occupied + " occupied · " + reserved + " reserved";
  $("tableGrid").innerHTML = tables.length ? tables.map((table) => {
    const order = orderForTable(table.id);
    const status = order ? "occupied" : table.is_reserved ? "reserved" : "available";
    const statusText = order ? "Occupied" : table.is_reserved ? "Reserved" : "Available";
    return '<div class="table-tile" style="cursor:default"><button type="button" data-table-id="' + safe(table.id) + '" style="border:0;background:transparent;padding:0;text-align:left;width:100%;cursor:pointer"><strong>Table ' + safe(table.table_number) + '</strong><span class="status ' + status + '">' + statusText + '</span><small>' + safe(table.capacity) + ' seats' + (order ? ' · Open order' : '') + '</small></button><div style="display:flex;gap:6px;margin-top:12px"><button type="button" class="secondary-btn" data-reserve-id="' + safe(table.id) + '" style="padding:6px 8px;font-size:12px">' + (table.is_reserved ? 'Unreserve' : 'Reserve') + '</button><button type="button" class="secondary-btn" data-remove-table="' + safe(table.id) + '" style="padding:6px 8px;font-size:12px" ' + (order ? 'disabled' : '') + '>Remove</button></div></div>';
  }).join("") : '<div class="empty-state">No tables configured yet. Select “Add Table” to create your floor plan.</div>';

  document.querySelectorAll("[data-table-id]").forEach((button) => button.addEventListener("click", () => startOrder("dine_in", button.dataset.tableId)));
  document.querySelectorAll("[data-reserve-id]").forEach((button) => button.addEventListener("click", () => toggleReservation(button.dataset.reserveId)));
  document.querySelectorAll("[data-remove-table]").forEach((button) => button.addEventListener("click", () => removeTable(button.dataset.removeTable)));
}

async function startOrder(orderType, tableId) {
  if (busy) return;
  setBusy(true);
  clearNotice();
  try {
    const data = await runQuery(db.rpc("start_pos_order", {
      p_order_type: orderType,
      p_table_id: tableId,
      p_customer_name: $("customerName").value.trim() || "Walk-in Customer"
    }));
    currentOrder = Array.isArray(data) ? data[0] : data;
    mode = orderType;
    await loadOrderItems();
    await loadAll();
    renderOrder();
  } catch (error) {
    console.error(error);
    notify("Could not open the order: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function selectOrder(orderId) {
  const order = openOrders.find((item) => item.id === orderId);
  if (!order) return;
  currentOrder = order;
  mode = order.order_type;
  $("customerName").value = order.customer_name || "";
  await loadOrderItems();
  renderFloor();
  renderOrder();
}

async function loadOrderItems() {
  if (!currentOrder) { orderItems = []; return; }
  orderItems = await runQuery(db.from("table_order_items").select("id,menu_item_id,item_name,quantity,unit_price,line_total,food_type").eq("restaurant_id", window.RESTAURANT_ID).eq("order_id", currentOrder.id).order("created_at")) || [];
}

function renderOrder() {
  const order = currentOrder;
  const table = order && order.table_id ? tables.find((item) => item.id === order.table_id) : null;
  $("orderTitle").textContent = order ? (order.order_type === "dine_in" ? "Table " + (table?.table_number || "") : "Takeaway Order") : "Current Order";
  $("orderSubtitle").textContent = order ? ((order.customer_name || "Walk-in Customer") + " · " + (order.status === "open" ? "Open" : "Paid")) : "Choose a table or start takeaway.";
  $("orderStatus").textContent = order ? (order.status === "open" ? "Open order" : "Paid") : "No order";
  $("orderStatus").className = "status " + (order ? "occupied" : "available");
  $("customerName").value = order?.customer_name || "";
  $("orderItems").innerHTML = orderItems.length ? orderItems.map((item) =>
    '<div class="order-line"><div><strong>' + safe(item.item_name) + '</strong><small>' + money(item.unit_price) + ' each</small></div><div style="text-align:right"><strong>' + money(item.line_total) + '</strong><div class="line-actions"><span>×' + safe(item.quantity) + '</span><button type="button" data-remove-item="' + safe(item.id) + '" aria-label="Remove ' + safe(item.item_name) + '">Remove</button></div></div></div>'
  ).join("") : '<div class="empty-state">Add menu items to start this order.</div>';

  const subtotal = orderItems.reduce((sum, item) => sum + Number(item.line_total), 0);
  const tax = Math.round(subtotal * 5) / 100;
  $("orderSubtotal").innerHTML = '<span>Subtotal</span><strong>' + money(subtotal) + '</strong>';
  $("orderTax").innerHTML = '<span>Tax (5%)</span><strong>' + money(tax) + '</strong>';
  $("orderTotal").innerHTML = '<span>Total</span><span>' + money(subtotal + tax) + '</span>';
  document.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => removeOrderItem(button.dataset.removeItem)));
  updateActions();
}

async function addMenuItem() {
  if (!currentOrder || !$("menuSelect").value || busy) return;
  setBusy(true);
  clearNotice();
  try {
    await runQuery(db.rpc("add_pos_order_item", {
      p_order_id: currentOrder.id,
      p_menu_item_id: Number($("menuSelect").value),
      p_quantity: 1
    }));
    $("menuSelect").value = "";
    await loadOrderItems();
    await loadAll();
    renderOrder();
    notify("Item added to the open order.");
  } catch (error) {
    console.error(error);
    notify("Could not add item: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function removeOrderItem(itemId) {
  if (!currentOrder || busy || !confirm("Remove this item from the open order?")) return;
  setBusy(true);
  try {
    await runQuery(db.from("table_order_items").delete().eq("id", itemId).eq("order_id", currentOrder.id).eq("restaurant_id", window.RESTAURANT_ID));
    await loadOrderItems();
    renderOrder();
  } catch (error) {
    notify("Could not remove item: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function saveOpenOrder() {
  if (!currentOrder || busy) return;
  setBusy(true);
  try {
    const customerName = $("customerName").value.trim() || "Walk-in Customer";
    const updated = await runQuery(db.from("table_orders").update({ customer_name: customerName, updated_at: new Date().toISOString() }).eq("id", currentOrder.id).eq("restaurant_id", window.RESTAURANT_ID).select().single());
    currentOrder = updated;
    await loadAll();
    renderOrder();
    notify("Open order saved. You can continue it later.");
  } catch (error) {
    notify("Could not save order: " + error.message);
  } finally {
    setBusy(false);
  }
}

function invoiceNumber() {
  const date = new Date();
  const stamp = [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("");
  return "INV-" + stamp + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function settleOrder() {
  if (!currentOrder || !orderItems.length || busy) return;
  if (!confirm("Confirm payment received and close this order?")) return;
  setBusy(true);
  clearNotice();
  try {
    const customerName = $("customerName").value.trim() || "Walk-in Customer";
    await runQuery(db.from("table_orders").update({ customer_name: customerName, updated_at: new Date().toISOString() }).eq("id", currentOrder.id).eq("restaurant_id", window.RESTAURANT_ID));
    const data = await runQuery(db.rpc("settle_pos_order", {
      p_order_id: currentOrder.id,
      p_invoice_number: invoiceNumber(),
      p_payment_method: $("paymentMethod").value
    }));
    const invoice = Array.isArray(data) ? data[0] : data;
    const settledItems = [...orderItems];
    const settledOrder = currentOrder;
    currentOrder = null;
    orderItems = [];
    await loadAll();
    renderOrder();
    printReceipt(invoice, settledItems, settledOrder);
    notify("Payment saved and invoice " + invoice.invoice_number + " created.");
  } catch (error) {
    console.error(error);
    notify("Could not settle order: " + error.message);
  } finally {
    setBusy(false);
  }
}

function printReceipt(invoice, items, order) {
  const table = order.table_id ? tables.find((item) => item.id === order.table_id) : null;
  const rows = items.map((item) => '<tr><td>' + safe(item.item_name) + '</td><td>' + safe(item.quantity) + '</td><td>' + money(item.unit_price) + '</td><td>' + money(item.line_total) + '</td></tr>').join("");
  const printWindow = window.open("", "_blank", "width=720,height=800");
  if (!printWindow) {
    notify("Invoice " + invoice.invoice_number + " saved. Allow pop-ups to print the receipt.");
    return;
  }
  printWindow.document.write('<!doctype html><html><head><title>Invoice ' + safe(invoice.invoice_number) + '</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;max-width:680px;margin:30px auto;color:#172b2d}header{border-bottom:2px solid #172b2d;padding-bottom:15px;display:flex;justify-content:space-between;gap:15px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px 4px;border-bottom:1px solid #ddd}th:last-child,td:last-child{text-align:right}.totals{margin:20px 0 20px auto;width:260px}.totals div{display:flex;justify-content:space-between;padding:5px}.grand{font-size:18px;font-weight:bold;border-top:1px solid #333;padding-top:10px!important}@media print{button{display:none}}</style></head><body><header><div><h2>' + safe(window.RESTAURANT_NAME || "Restaurant") + '</h2><p>' + safe(order.order_type === "dine_in" ? "Dine-in · Table " + (table?.table_number || "") : "Takeaway") + '</p><p>Customer: ' + safe(invoice.customer_name || "Walk-in Customer") + '</p></div><div><strong>' + safe(invoice.invoice_number) + '</strong><p>' + new Date(invoice.invoice_date || Date.now()).toLocaleString("en-IN") + '</p><p>Paid by: ' + safe(invoice.payment_method) + '</p></div></header><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>' + rows + '</tbody></table><div class="totals"><div><span>Subtotal</span><strong>' + money(invoice.subtotal) + '</strong></div><div><span>Tax (5%)</span><strong>' + money(invoice.tax) + '</strong></div><div class="grand"><span>Total</span><strong>' + money(invoice.total) + '</strong></div></div><p style="text-align:center;margin-top:35px">Thank you! Visit again.</p><script>window.onload=()=>window.print();<\/script></body></html>');
  printWindow.document.close();
}

async function addTable() {
  const tableNumber = prompt("Enter table number or name (for example, 1 or A1):");
  if (!tableNumber || !tableNumber.trim()) return;
  const capacityInput = prompt("How many seats? (default 4)", "4");
  const capacity = Number(capacityInput || 4);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    alert("Capacity must be a whole number between 1 and 50.");
    return;
  }
  setBusy(true);
  try {
    await runQuery(db.from("restaurant_tables").insert({
      restaurant_id: window.RESTAURANT_ID,
      table_number: tableNumber.trim(),
      capacity
    }));
    await loadAll();
    notify("Table " + tableNumber.trim() + " added.");
  } catch (error) {
    alert("Could not add table: " + error.message);
  } finally {
    setBusy(false);
  }
}

async function toggleReservation(tableId) {
  const table = tables.find((item) => item.id === tableId);
  if (!table) return;
  if (orderForTable(tableId)) {
    alert("This table has an open order. Settle or cancel it before changing the reservation.");
    return;
  }
  try {
    await runQuery(db.from("restaurant_tables").update({ is_reserved: !table.is_reserved }).eq("id", tableId).eq("restaurant_id", window.RESTAURANT_ID));
    await loadAll();
  } catch (error) {
    alert("Could not update reservation: " + error.message);
  }
}

async function removeTable(tableId) {
  if (orderForTable(tableId)) {
    alert("This table has an open order and cannot be removed.");
    return;
  }
  if (!confirm("Remove this table? This does not delete any past invoices.")) return;
  try {
    await runQuery(db.from("restaurant_tables").delete().eq("id", tableId).eq("restaurant_id", window.RESTAURANT_ID));
    await loadAll();
  } catch (error) {
    alert("Could not remove table: " + error.message);
  }
}

$("dineInMode").addEventListener("click", () => { mode = "dine_in"; renderFloor(); });
$("takeawayMode").addEventListener("click", () => { mode = "takeaway"; renderFloor(); });
$("addTableBtn").addEventListener("click", addTable);
$("refreshBtn").addEventListener("click", async () => {
  try { await loadAll(); if (currentOrder) { await loadOrderItems(); renderOrder(); } clearNotice(); }
  catch (error) { notify("Refresh failed: " + error.message); }
});
$("addItemBtn").addEventListener("click", addMenuItem);
$("saveOrderBtn").addEventListener("click", saveOpenOrder);
$("settleBtn").addEventListener("click", settleOrder);
$("menuSelect").addEventListener("change", updateActions);
$("customerName").addEventListener("change", () => { if (currentOrder) updateActions(); });

window.restaurantAuthReady.then(async (session) => {
  if (!session) return;
  try {
    await loadAll();
    renderOrder();
  } catch (error) {
    console.error(error);
    $("tableGrid").innerHTML = '<div class="empty-state">Unable to load tables. Apply the table-wise billing migration in Supabase, then refresh this page.<br><br>' + safe(error.message) + '</div>';
  }
}).catch((error) => {
  console.error(error);
  $("tableGrid").innerHTML = '<div class="empty-state">Unable to initialize the restaurant session. Please sign in again.</div>';
});
