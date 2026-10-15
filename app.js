(() => {
  "use strict";

  const STORAGE_KEY = "threadline-prototype-v1";
  const LOW_STOCK_THRESHOLD = 25;
  const MATERIALS = [
    { id: "cotton", name: "Organic cotton", unit: "meters", perOrder: 2, initial: 420, supplier: "Greenfield Textiles" },
    { id: "linen", name: "Natural linen", unit: "meters", perOrder: 1, initial: 160, supplier: "North Loom Supply" },
    { id: "dye", name: "Plant-based dye", unit: "liters", perOrder: 0.25, initial: 38, supplier: "Hue & Earth Co." },
    { id: "thread", name: "Spool thread", unit: "spools", perOrder: 1, initial: 80, supplier: "Stitchworks Supply" }
  ];
  const ORDER_STATUSES = ["Placed", "In production", "Inspection passed", "Inspection failed", "Shipped", "Delivered", "Cancelled"];
  const PRODUCT_RECIPES = {
    "Cotton T-shirt": { cotton: 2, dye: 0.25, thread: 1 },
    "Linen tote": { linen: 1, thread: 1 },
    "Cotton throw": { cotton: 4, dye: 0.5, thread: 2 }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function seedState() {
    const today = new Date().toISOString();
    const orders = [
      {
        id: "ORD-2401", customerId: "CUS-1001", product: "Cotton T-shirt", quantity: 24, total: 720,
        status: "In production", createdAt: new Date(Date.now() - 86400000).toISOString(),
        history: [{ label: "Order placed", detail: "Materials reserved and order confirmed", at: new Date(Date.now() - 86400000).toISOString() }, { label: "Production started", detail: "Work began on the production floor", at: new Date(Date.now() - 43200000).toISOString() }],
        reserved: { cotton: 48, dye: 6, thread: 24 }, inspection: null, freight: null, refund: null
      },
      {
        id: "ORD-2402", customerId: "CUS-1002", product: "Linen tote", quantity: 40, total: 560,
        status: "Placed", createdAt: new Date(Date.now() - 21600000).toISOString(),
        history: [{ label: "Order placed", detail: "Materials reserved and order confirmed", at: new Date(Date.now() - 21600000).toISOString() }],
        reserved: { linen: 40, thread: 40 }, inspection: null, freight: null, refund: null
      }
    ];
    const reservedTotals = orders.reduce((totals, order) => {
      Object.entries(order.reserved).forEach(([id, quantity]) => { totals[id] = (totals[id] || 0) + quantity; });
      return totals;
    }, {});
    return {
      customers: [
        { id: "CUS-1001", name: "Maya Chen", zip: "10013", phone: "(212) 555-0184", createdAt: today },
        { id: "CUS-1002", name: "Oliver Brooks", zip: "60611", phone: "(312) 555-0128", createdAt: today },
        { id: "CUS-1003", name: "Nina Patel", zip: "94103", phone: "(415) 555-0166", createdAt: today }
      ],
      materials: MATERIALS.map(item => ({ ...item, quantity: item.initial - (reservedTotals[item.id] || 0) })),
      orders,
      nextOrder: 2403,
      nextCustomer: 1004,
      currentUser: null
    };
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const initial = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    try {
      const state = JSON.parse(saved);
      if (!Array.isArray(state.customers) || !Array.isArray(state.orders) || !Array.isArray(state.materials)) throw new Error("Saved workspace data is incomplete.");
      return state;
    } catch (error) {
      console.error("Unable to load saved workspace data:", error);
      throw new Error("Saved workspace data could not be read. Clear the prototype data in this browser to start fresh.");
    }
  }

  let state;
  try {
    state = loadState();
  } catch (error) {
    document.body.innerHTML = `<main style="max-width:560px;margin:12vh auto;padding:24px;font:14px sans-serif"><h1>Workspace data unavailable</h1><p>${escapeHtml(error.message)}</p><button onclick="localStorage.removeItem('${STORAGE_KEY}');location.reload()">Reset prototype data</button></main>`;
    return;
  }

  let activePage = "overview";
  let selectedOrderId = null;
  let orderSearch = "";
  let customerSearch = "";

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const customerFor = id => state.customers.find(customer => customer.id === id);
  const formatDate = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  const formatDateTime = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const initials = name => name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const statusClass = status => ({
    "Placed": "status-placed", "In production": "status-production", "Inspection passed": "status-ready",
    "Inspection failed": "status-failed", "Shipped": "status-shipped", "Delivered": "status-delivered", "Cancelled": "status-cancelled"
  })[status] || "status-inspection";
  const statusPill = status => `<span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const toast = (message, error = false) => {
    const node = document.createElement("div");
    node.className = `toast${error ? " error" : ""}`;
    node.textContent = message;
    $("#toast-region").append(node);
    setTimeout(() => node.remove(), 3200);
  };
  const addHistory = (order, label, detail) => order.history.push({ label, detail, at: new Date().toISOString() });

  function showApp() {
    $("#login-screen").hidden = true;
    $("#app").hidden = false;
    $("#user-name").textContent = state.currentUser === "Manager" ? "Morgan Reyes" : "Alex Lee";
    $("#user-role").textContent = state.currentUser;
    $("#today-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date());
    render();
  }

  function setPage(page) {
    activePage = page;
    selectedOrderId = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function heading(kicker, title, subtitle, action = "") {
    return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }

  function orderRows(orders, withCustomer = true) {
    if (!orders.length) return `<tr><td class="table-empty" colspan="${withCustomer ? 5 : 4}">No orders yet. Create an order to get started.</td></tr>`;
    return orders.map(order => {
      const customer = customerFor(order.customerId);
      return `<tr><td><strong>${escapeHtml(order.id)}</strong></td>${withCustomer ? `<td>${escapeHtml(customer?.name || "Unknown customer")}</td>` : ""}<td>${escapeHtml(order.product)} <span style="color:#929991">× ${order.quantity}</span></td><td>${statusPill(order.status)}</td><td><button class="table-action" data-open-order="${escapeHtml(order.id)}">View order →</button></td></tr>`;
    }).join("");
  }

  function renderOverview() {
    const openOrders = state.orders.filter(order => !["Delivered", "Cancelled"].includes(order.status));
    const lowMaterials = state.materials.filter(material => material.quantity <= LOW_STOCK_THRESHOLD);
    const completed = state.orders.filter(order => order.status === "Delivered").length;
    const orderCount = state.orders.length;
    return `${heading("YOUR WORKSPACE", "Good work starts here.", "A clear view of the moving parts behind every finished piece.", `<button class="button button-primary" data-action="new-order">＋ &nbsp;New order</button>`)}
      <section class="stats-grid">
        <article class="stat-card"><div class="stat-top"><span>Active orders</span><span class="stat-icon">▤</span></div><div class="stat-value">${openOrders.length}</div><div class="stat-foot"><em>${state.orders.filter(order => order.status === "Placed").length} new</em> · across your floor</div></article>
        <article class="stat-card"><div class="stat-top"><span>Registered customers</span><span class="stat-icon">♧</span></div><div class="stat-value">${state.customers.length}</div><div class="stat-foot">People making things happen</div></article>
        <article class="stat-card"><div class="stat-top"><span>Delivered orders</span><span class="stat-icon">↗</span></div><div class="stat-value">${completed}</div><div class="stat-foot">${orderCount ? `${Math.round(completed / orderCount * 100)}% of all orders complete` : "Ready for your first order"}</div></article>
        <article class="stat-card"><div class="stat-top"><span>Materials to watch</span><span class="stat-icon">▧</span></div><div class="stat-value">${lowMaterials.length}</div><div class="stat-foot">${lowMaterials.length ? "Below your 25-unit threshold" : "Everything is looking healthy"}</div></article>
      </section>
      <div class="overview-grid">
        <section class="card"><div class="card-head"><div><h2>Recent orders</h2><p>A little progress, every day.</p></div><button class="text-button" data-page="orders">All orders →</button></div><div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEM</th><th>STATUS</th><th></th></tr></thead><tbody>${orderRows([...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5))}</tbody></table></div></section>
        <section class="card"><div class="card-head"><div><h2>Stock to replenish</h2><p>Keep production moving.</p></div><button class="text-button" data-page="stock">View stock →</button></div><div class="low-stock-list">${lowMaterials.length ? lowMaterials.map(material => `<div class="low-stock-row"><div class="material-name">${escapeHtml(material.name)}<small>${escapeHtml(material.unit)}</small></div><div class="stock-indicator">${material.quantity} left<small>Low stock</small></div></div>`).join("") : `<div class="empty-note">No low-stock materials right now.</div>`}</div></section>
      </div>`;
  }

  function renderOrders() {
    const filtered = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(order => {
      const customer = customerFor(order.customerId);
      const query = orderSearch.toLowerCase();
      return !query || `${order.id} ${order.product} ${customer?.name || ""} ${order.status}`.toLowerCase().includes(query);
    });
    return `${heading("ORDER MANAGEMENT", "Orders", "Every piece, from first stitch to final delivery.", `<div class="toolbar"><input id="order-search" class="search-input" placeholder="Search orders..." value="${escapeHtml(orderSearch)}" aria-label="Search orders"><button class="button button-primary" data-action="new-order">＋ &nbsp;New order</button></div>`)}
      <section class="card data-card"><div class="card-head"><div><h2>All orders <span style="color:#919991;font-weight:500">· ${state.orders.length}</span></h2><p>Manage production and delivery progress.</p></div></div><div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEM</th><th>STATUS</th><th></th></tr></thead><tbody>${orderRows(filtered)}</tbody></table></div></section>`;
  }

  function renderCustomers() {
    const filtered = [...state.customers].sort((a, b) => a.name.localeCompare(b.name)).filter(customer => `${customer.name} ${customer.zip} ${customer.phone}`.toLowerCase().includes(customerSearch.toLowerCase()));
    return `${heading("PEOPLE & PARTNERS", "Customers", "Good relationships make better work.", `<div class="toolbar"><input id="customer-search" class="search-input" placeholder="Find a customer..." value="${escapeHtml(customerSearch)}" aria-label="Search customers"><button class="button button-primary" data-action="new-customer">＋ &nbsp;Add customer</button></div>`)}
      <section class="card data-card"><div class="card-head"><div><h2>Customer directory <span style="color:#919991;font-weight:500">· ${state.customers.length}</span></h2><p>Only registered customers can place orders.</p></div></div><div class="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>ZIP CODE</th><th>PHONE</th><th>ORDERS</th><th></th></tr></thead><tbody>${filtered.length ? filtered.map(customer => {
        const count = state.orders.filter(order => order.customerId === customer.id).length;
        return `<tr><td><div class="customer-name-cell"><span class="mini-avatar">${escapeHtml(initials(customer.name))}</span><strong>${escapeHtml(customer.name)}</strong></div></td><td>${escapeHtml(customer.zip)}</td><td>${escapeHtml(customer.phone)}</td><td>${count} ${count === 1 ? "order" : "orders"}</td><td><button class="table-action" data-action="customer-order" data-customer-id="${escapeHtml(customer.id)}">＋ New order</button></td></tr>`;
      }).join("") : `<tr><td colspan="5" class="table-empty">No customers match your search.</td></tr>`}</tbody></table></div></section>`;
  }

  function renderStock() {
    const low = state.materials.filter(material => material.quantity <= LOW_STOCK_THRESHOLD).length;
    return `${heading("MATERIALS & SUPPLY", "Materials & stock", "Know what you have. Replenish what you need.", `<button class="button button-primary" data-action="purchase-materials">＋ &nbsp;Purchase materials</button>`)}
      <section class="stock-summary"><article class="stat-card"><div class="stat-top">Tracked materials<span class="stat-icon">▧</span></div><div class="stat-value">${state.materials.length}</div></article><article class="stat-card"><div class="stat-top">Need replenishment<span class="stat-icon">!</span></div><div class="stat-value">${low}</div></article><article class="stat-card"><div class="stat-top">Materials reserved<span class="stat-icon">▤</span></div><div class="stat-value">${state.orders.filter(order => !["Delivered", "Cancelled"].includes(order.status)).length}</div></article></section>
      <section class="card data-card"><div class="card-head"><div><h2>Material inventory</h2><p>Orders reserve stock when they are placed · low stock is 25 units or fewer.</p></div></div><div class="table-wrap"><table><thead><tr><th>MATERIAL</th><th>ON HAND</th><th>UNIT</th><th>SUPPLIER</th><th>STATUS</th><th></th></tr></thead><tbody>${state.materials.map(material => `<tr><td><strong>${escapeHtml(material.name)}</strong></td><td><strong>${material.quantity}</strong></td><td>${escapeHtml(material.unit)}</td><td>${escapeHtml(material.supplier)}</td><td><span class="stock-status ${material.quantity <= LOW_STOCK_THRESHOLD ? "low" : ""}">${material.quantity <= LOW_STOCK_THRESHOLD ? "● Low stock" : "● In stock"}</span></td><td><button class="table-action" data-action="purchase-one" data-material-id="${escapeHtml(material.id)}">＋ Purchase</button></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderDetail(order) {
    if (!order) { selectedOrderId = null; return renderOrders(); }
    const customer = customerFor(order.customerId);
    const progressStatuses = ["Placed", "In production", "Inspection passed", "Shipped", "Delivered"];
    const progressIndex = progressStatuses.indexOf(order.status);
    const history = [...order.history].reverse();
    const actionMarkup = [];
    if (order.status === "Placed") actionMarkup.push(`<button class="button button-primary" data-order-action="production">Start production <span>→</span></button>`);
    if (order.status === "In production") actionMarkup.push(`<button class="button button-primary" data-order-action="inspection">Record final inspection <span>→</span></button>`);
    if (order.status === "Inspection passed") actionMarkup.push(`<button class="button button-primary" data-order-action="ship">Arrange freight shipping <span>→</span></button>`);
    if (order.status === "Shipped") actionMarkup.push(`<button class="button button-primary" data-order-action="deliver">Mark as delivered <span>→</span></button>`);
    if (["Placed", "In production", "Inspection passed", "Inspection failed"].includes(order.status)) actionMarkup.push(`<button class="button button-danger" data-order-action="cancel">Cancel order &amp; refund</button>`);
    let progress = "";
    if (order.status === "Inspection failed" || order.status === "Cancelled") progress = `<div class="workflow-note">${order.status === "Inspection failed" ? "This order did not pass final inspection. It cannot be shipped. Cancel the order to record a refund and return its reserved materials." : "This order was cancelled. Its refund and stock restoration are recorded above."}</div>`;
    else progress = `<div class="progress-track">${progressStatuses.map((status, index) => `<div class="progress-step ${index <= progressIndex ? "done" : ""}"><span class="progress-dot"></span>${index < progressStatuses.length - 1 ? `<span class="progress-line"></span>` : ""}</div>`).join("")}</div><div class="progress-labels">${progressStatuses.map((status, index) => `<span>${index === progressIndex ? `<strong>${status}</strong>` : status}</span>`).join("")}</div>`;
    const inspectionMarkup = order.inspection ? `<div class="inspection-result ${order.inspection.result === "Pass" ? "pass" : "fail"}"><strong>${order.inspection.result === "Pass" ? "✓ Passed" : "✕ Failed"}</strong><span>· ${escapeHtml(order.inspection.notes || "No additional notes")}</span></div>` : "";
    return `<button class="detail-back" data-page="orders">← &nbsp;Back to orders</button>
      <div class="page-heading"><div><span class="eyebrow">ORDER DETAIL</span><h1>${escapeHtml(order.id)}</h1><p>Placed ${formatDate(order.createdAt)} · ${escapeHtml(order.product)}</p></div><div class="detail-head-actions">${statusPill(order.status)}</div></div>
      <div class="detail-layout"><div class="detail-main">
        <section class="card"><div class="card-head"><div><h2>Order progress</h2><p>Follow this order from the floor to the customer's door.</p></div></div><div class="detail-body">${progress}</div></section>
        <section class="card"><div class="card-head"><div><h2>Order history</h2><p>A record of every important step.</p></div></div><div class="detail-body"><div class="history-list">${history.map(item => `<div class="history-item"><span class="history-dot"></span><div class="history-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)} · ${formatDateTime(item.at)}</small></div></div>`).join("")}</div></div></section>
      </div><aside class="detail-side">
        <section class="card"><div class="card-head"><h2>Order summary</h2></div><div class="detail-body"><div class="detail-id"><span class="mini-avatar">${escapeHtml(initials(customer?.name || "?"))}</span><div><strong style="font-size:12px">${escapeHtml(customer?.name || "Unknown customer")}</strong><p>${escapeHtml(customer?.phone || "")}</p></div></div><div class="detail-stats"><div><span>Product</span><strong>${escapeHtml(order.product)}</strong></div><div><span>Quantity</span><strong>${order.quantity} units</strong></div><div><span>Order total</span><strong>${money(order.total)}</strong></div></div><div style="margin-top:14px">${customer ? `<div class="detail-info-row"><span>Delivery ZIP</span><strong>${escapeHtml(customer.zip)}</strong></div>` : ""}${order.refund ? `<div class="detail-info-row"><span>Refund recorded</span><strong>${money(order.refund.amount)}</strong></div>` : ""}${order.freight ? `<div class="detail-info-row"><span>Freight company</span><strong>${escapeHtml(order.freight)}</strong></div>` : ""}</div></div></section>
        ${order.inspection ? `<section class="card"><div class="card-head"><h2>Final inspection</h2></div><div class="detail-body">${inspectionMarkup}<div class="detail-info-row" style="margin-top:8px"><span>Inspected</span><strong>${formatDateTime(order.inspection.at)}</strong></div></div></section>` : ""}
        ${actionMarkup.length ? `<section class="card"><div class="card-head"><h2>Next step</h2></div><div class="detail-body"><div class="workflow-actions">${actionMarkup.join("")}</div>${order.status === "Inspection passed" ? `<p class="form-hint" style="margin:10px 0 0">Freight shipping is available only after a passing final inspection.</p>` : ""}</div></section>` : ""}
      </aside></div>`;
  }

  function render() {
    const pageNames = { overview: "Overview", orders: "Orders", customers: "Customers", stock: "Materials & stock" };
    const currentPage = selectedOrderId ? "Order detail" : (pageNames[activePage] || "Overview");
    $("#page-crumb").textContent = currentPage;
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === activePage && !selectedOrderId));
    $("#nav-order-count").textContent = state.orders.filter(order => !["Delivered", "Cancelled"].includes(order.status)).length;
    $("#page-content").innerHTML = selectedOrderId ? renderDetail(state.orders.find(order => order.id === selectedOrderId)) : ({
      overview: renderOverview, orders: renderOrders, customers: renderCustomers, stock: renderStock
    })[activePage]();
  }

  function showModal(title, description, body, submitLabel, onSubmit) {
    const existing = $("#modal-backdrop");
    if (existing) existing.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "modal-backdrop";
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><button type="button" class="modal-close" aria-label="Close">×</button></header><form class="modal-form">${body}<div class="modal-actions"><button type="button" class="button button-secondary" data-modal-close>Cancel</button><button type="submit" class="button button-primary">${escapeHtml(submitLabel)}</button></div></form></section>`;
    document.body.append(backdrop);
    backdrop.querySelector(".modal-close").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("[data-modal-close]").addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      try {
        if (onSubmit(new FormData(event.currentTarget)) !== false) backdrop.remove();
      } catch (error) {
        toast(error.message || "That action could not be completed.", true);
      }
    });
    const focusable = backdrop.querySelector("input,select,textarea");
    if (focusable) focusable.focus();
  }

  function customerOptions(selectedId = "") {
    return state.customers.map(customer => `<option value="${escapeHtml(customer.id)}" ${customer.id === selectedId ? "selected" : ""}>${escapeHtml(customer.name)} · ${escapeHtml(customer.zip)}</option>`).join("");
  }

  function openCustomerModal() {
    showModal("Add a customer", "Create a customer profile before placing an order.", `<div class="form-grid"><div class="form-field full"><label for="customer-name">Full name</label><input id="customer-name" name="name" required maxlength="80" placeholder="e.g. Jordan Rivera"></div><div class="form-field"><label for="customer-zip">ZIP code</label><input id="customer-zip" name="zip" required inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxlength="10" placeholder="e.g. 10013"></div><div class="form-field"><label for="customer-phone">Phone number</label><input id="customer-phone" name="phone" required type="tel" maxlength="24" placeholder="(212) 555-0100"></div></div>`, "Save customer", form => {
      const name = String(form.get("name") || "").trim();
      const zip = String(form.get("zip") || "").trim();
      const phone = String(form.get("phone") || "").trim();
      if (!name || !/^\d{5}(-\d{4})?$/.test(zip) || phone.length < 7) throw new Error("Enter a name, a valid ZIP code, and a phone number.");
      const customer = { id: `CUS-${state.nextCustomer++}`, name, zip, phone, createdAt: new Date().toISOString() };
      state.customers.push(customer);
      save();
      render();
      toast(`${name} added to your customers.`);
    });
  }

  function calculateRequirements(product, quantity) {
    const recipe = PRODUCT_RECIPES[product];
    return Object.fromEntries(Object.entries(recipe).map(([id, amount]) => [id, amount * quantity]));
  }

  function orderModal(customerId = "") {
    if (!state.customers.length) {
      toast("Add a registered customer before placing an order.", true);
      openCustomerModal();
      return;
    }
    const options = Object.keys(PRODUCT_RECIPES).map(product => `<option value="${escapeHtml(product)}">${escapeHtml(product)}</option>`).join("");
    showModal("Create an order", "A customer must be registered. Available materials are checked before confirming.", `<div class="form-grid"><div class="form-field full"><label for="order-customer">Customer</label><select name="customerId" id="order-customer" required>${customerOptions(customerId)}</select></div><div class="form-field full"><label for="order-product">Product</label><select name="product" id="order-product">${options}</select></div><div class="form-field"><label for="order-quantity">Quantity</label><input id="order-quantity" name="quantity" type="number" min="1" max="10000" required value="12"></div><div class="form-field"><label>Estimated total</label><div id="order-total-preview" style="padding:10px 0;font-weight:700">$360</div></div><div class="form-field full"><span class="form-hint">Required materials are reserved from stock once the order is placed. The selected product determines its materials recipe.</span></div></div>`, "Check stock & place order", form => {
      const customer = customerFor(String(form.get("customerId")));
      const product = String(form.get("product"));
      const quantity = Number(form.get("quantity"));
      if (!customer) throw new Error("Orders can only be placed for registered customers.");
      if (!PRODUCT_RECIPES[product] || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error("Choose a product and a whole-number quantity from 1 to 10,000.");
      const required = calculateRequirements(product, quantity);
      const shortage = Object.entries(required).map(([id, amount]) => {
        const material = state.materials.find(item => item.id === id);
        return material && material.quantity < amount ? `${material.name} (need ${amount} ${material.unit}, have ${material.quantity})` : null;
      }).filter(Boolean);
      if (shortage.length) throw new Error(`Not enough stock: ${shortage.join("; ")}.`);
      Object.entries(required).forEach(([id, amount]) => { state.materials.find(material => material.id === id).quantity -= amount; });
      const order = {
        id: `ORD-${state.nextOrder++}`, customerId: customer.id, product, quantity,
        total: quantity * ({ "Cotton T-shirt": 30, "Linen tote": 14, "Cotton throw": 58 }[product]),
        status: "Placed", createdAt: new Date().toISOString(), reserved: required,
        history: [{ label: "Order placed", detail: "Stock checked and materials reserved", at: new Date().toISOString() }],
        inspection: null, freight: null, refund: null
      };
      state.orders.push(order);
      save();
      activePage = "orders";
      selectedOrderId = order.id;
      render();
      toast(`${order.id} placed. Materials reserved.`);
    });
    const updateTotal = () => {
      const form = $("#modal-backdrop form");
      if (!form) return;
      const quantity = Math.max(0, Number(form.elements.quantity.value) || 0);
      const product = form.elements.product.value;
      $("#order-total-preview").textContent = money(quantity * ({ "Cotton T-shirt": 30, "Linen tote": 14, "Cotton throw": 58 }[product]));
    };
    $("#order-quantity").addEventListener("input", updateTotal);
    $("#order-product").addEventListener("change", updateTotal);
  }

  function purchaseModal(materialId = "") {
    const orderedMaterials = materialId ? state.materials.filter(material => material.id === materialId) : state.materials;
    showModal("Purchase materials", "Record incoming supply and update on-hand inventory.", `<div class="form-grid"><div class="form-field full"><label for="purchase-material">Material</label><select name="materialId" id="purchase-material">${orderedMaterials.map(material => `<option value="${escapeHtml(material.id)}">${escapeHtml(material.name)} · ${material.quantity} ${escapeHtml(material.unit)} on hand</option>`).join("")}</select></div><div class="form-field"><label for="purchase-quantity">Quantity to add</label><input id="purchase-quantity" name="quantity" type="number" min="1" max="100000" step="1" required placeholder="e.g. 100"></div><div class="form-field"><label>Supplier</label><div id="purchase-supplier" style="padding:10px 0;font-size:12px"></div></div><div class="form-field full"><span class="form-hint">This prototype records the purchase locally. No supplier order or payment is sent.</span></div></div>`, "Record purchase", form => {
      const material = state.materials.find(item => item.id === String(form.get("materialId")));
      const quantity = Number(form.get("quantity"));
      if (!material || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error("Choose a material and a whole-number quantity from 1 to 100,000.");
      material.quantity += quantity;
      save();
      render();
      toast(`${quantity} ${material.unit} of ${material.name} added to stock.`);
    });
    const updateSupplier = () => {
      const material = state.materials.find(item => item.id === $("#purchase-material").value);
      $("#purchase-supplier").textContent = material?.supplier || "";
    };
    $("#purchase-material").addEventListener("change", updateSupplier);
    updateSupplier();
  }

  function orderAction(action) {
    const order = state.orders.find(item => item.id === selectedOrderId);
    if (!order) return;
    if (action === "production" && order.status === "Placed") {
      order.status = "In production";
      addHistory(order, "Production started", "Work began on the production floor");
    } else if (action === "inspection" && order.status === "In production") {
      showModal("Final inspection", "Inspect finished goods before deciding if they can be shipped.", `<div class="form-field"><label for="inspection-result">Inspection result</label><select name="result" id="inspection-result"><option value="Pass">Pass — ready for freight</option><option value="Fail">Fail — not ready to ship</option></select></div><div class="form-field"><label for="inspection-notes">Inspection notes</label><textarea id="inspection-notes" name="notes" maxlength="300" placeholder="Optional findings or quality notes"></textarea></div>`, "Save inspection", form => {
        const result = String(form.get("result"));
        const notes = String(form.get("notes") || "").trim();
        order.inspection = { result, notes, at: new Date().toISOString() };
        order.status = result === "Pass" ? "Inspection passed" : "Inspection failed";
        addHistory(order, `Final inspection ${result === "Pass" ? "passed" : "failed"}`, notes || (result === "Pass" ? "Quality check passed; shipping is now available" : "Quality check did not pass; shipping is blocked"));
        save(); render(); toast(result === "Pass" ? "Inspection passed. Freight shipping is now available." : "Inspection failed. Shipping is blocked.");
      });
      return;
    } else if (action === "ship" && order.status === "Inspection passed") {
      showModal("Arrange freight shipping", "Select a freight company. Only inspection-passed orders can ship.", `<div class="form-field"><label for="freight-company">Freight company</label><select name="freight" id="freight-company" required><option value="Old Dominion Freight Line">Old Dominion Freight Line</option><option value="XPO Logistics">XPO Logistics</option><option value="FedEx Freight">FedEx Freight</option><option value="Estes Express Lines">Estes Express Lines</option><option value="Other freight carrier">Other freight carrier</option></select></div><p class="form-hint">Shipping is enabled only after this order passes final inspection.</p>`, "Confirm freight shipment", form => {
        if (order.status !== "Inspection passed" || order.inspection?.result !== "Pass") throw new Error("This order must pass final inspection before it can ship.");
        order.freight = String(form.get("freight"));
        order.status = "Shipped";
        addHistory(order, "Shipped by freight", `Handed to ${order.freight}`);
        save(); render(); toast(`${order.id} shipped with ${order.freight}.`);
      });
      return;
    } else if (action === "deliver" && order.status === "Shipped") {
      order.status = "Delivered";
      addHistory(order, "Delivered", "Freight delivery confirmed");
    } else if (action === "cancel" && ["Placed", "In production", "Inspection passed", "Inspection failed"].includes(order.status)) {
      showModal("Cancel this order?", "The customer refund will be recorded and all reserved materials will return to stock.", `<div class="workflow-note">Refund to record: <strong>${money(order.total)}</strong><br>Materials to restore: ${Object.entries(order.reserved || {}).map(([id, amount]) => { const material = state.materials.find(item => item.id === id); return `${amount} ${material?.unit || "units"} ${material?.name || id}`; }).join(", ")}.</div><div class="form-field"><label for="refund-note">Refund note</label><input id="refund-note" name="notes" maxlength="200" placeholder="Optional refund reference"></div>`, "Cancel & record refund", form => {
        if (!["Placed", "In production", "Inspection passed", "Inspection failed"].includes(order.status)) throw new Error("This order can no longer be cancelled.");
        Object.entries(order.reserved || {}).forEach(([id, amount]) => {
          const material = state.materials.find(item => item.id === id);
          if (material) material.quantity += amount;
        });
        order.refund = { amount: order.total, note: String(form.get("notes") || "").trim(), at: new Date().toISOString() };
        order.status = "Cancelled";
        addHistory(order, "Order cancelled & refunded", `Refund of ${money(order.total)} recorded; reserved materials restored${order.refund.note ? ` · ${order.refund.note}` : ""}`);
        save(); render(); toast(`${order.id} cancelled. Refund recorded and stock restored.`);
      });
      return;
    } else {
      toast("This action is not available for the order's current status.", true);
      return;
    }
    save();
    render();
    toast(action === "deliver" ? "Order marked as delivered." : "Production started.");
  }

  document.addEventListener("click", event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      setPage(pageButton.dataset.page);
      return;
    }
    const openButton = event.target.closest("[data-open-order]");
    if (openButton) {
      selectedOrderId = openButton.dataset.openOrder;
      render();
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "new-order") orderModal();
      if (action === "new-customer") openCustomerModal();
      if (action === "purchase-materials") purchaseModal();
      if (action === "purchase-one") purchaseModal(actionButton.dataset.materialId);
      if (action === "customer-order") orderModal(actionButton.dataset.customerId);
      return;
    }
    const workflowButton = event.target.closest("[data-order-action]");
    if (workflowButton) orderAction(workflowButton.dataset.orderAction);
  });

  document.addEventListener("input", event => {
    if (event.target.id === "order-search") {
      orderSearch = event.target.value;
      const position = event.target.selectionStart;
      render();
      const search = $("#order-search");
      search.focus();
      search.setSelectionRange(position, position);
    }
    if (event.target.id === "customer-search") {
      customerSearch = event.target.value;
      const position = event.target.selectionStart;
      render();
      const search = $("#customer-search");
      search.focus();
      search.setSelectionRange(position, position);
    }
  });

  $("#login-form").addEventListener("submit", event => {
    event.preventDefault();
    state.currentUser = $("#login-role").value;
    save();
    showApp();
  });
  $("#logout-button").addEventListener("click", () => {
    state.currentUser = null;
    save();
    $("#app").hidden = true;
    $("#login-screen").hidden = false;
  });

  if (state.currentUser) {
    $("#login-role").value = state.currentUser;
    showApp();
  }
})();
