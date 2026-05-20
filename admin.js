let currentPage = "orders";
let menuData = [];
let lastVersion = "";
let poll = null;

const SWEET_LIB = ["正常", "少糖"];
const TEMP_LIB = ["正常冰", "少冰", "常溫", "溫", "熱", "冰"];

addEventListener("load", () => {
  renderOptionBoxes();
  switchPage(qs("tab", "orders"));
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentPage === "orders") loadOrders(false);
});

window.addEventListener("focus", () => {
  if (currentPage === "orders") loadOrders(false);
});

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function toggleFab() {
  document.getElementById("fabMenu").classList.toggle("open");
}

function switchPage(p) {
  currentPage = p;

  ["menu", "orders", "history", "reports"].forEach(x => {
    document.getElementById("page" + cap(x)).classList.toggle("active", x === p);
    const b = document.getElementById("fab" + cap(x) + "Btn");
    if (b) b.classList.toggle("active", x === p);
  });

  document.getElementById("pageTitle").textContent = {
    menu: "菜單管理",
    orders: "接單後台",
    history: "今日紀錄",
    reports: "報表"
  }[p] || "接單後台";

  document.getElementById("fabMenu").classList.remove("open");

  if (poll) clearInterval(poll);

  if (p === "menu") loadMenu();
  if (p === "orders") {
    loadOrders(true);
    poll = setInterval(() => {
      if (currentPage === "orders") loadOrders(false);
    }, 3000);
  }
  if (p === "history") loadHistory();
  if (p === "reports") loadReports();
}

function renderOptionBoxes() {
  document.getElementById("sweetOptions").innerHTML = SWEET_LIB.map(x => `
    <label><input type="checkbox" class="sweetCk" value="${attr(x)}"> ${esc(x)}</label>
  `).join("");

  document.getElementById("tempOptions").innerHTML = TEMP_LIB.map(x => `
    <label><input type="checkbox" class="tempCk" value="${attr(x)}"> ${esc(x)}</label>
  `).join("");
}

function getChecked(cls) {
  return [...document.querySelectorAll("." + cls + ":checked")].map(x => x.value).join(",");
}

function setChecked(cls, csv) {
  const arr = csvToArray(csv);
  document.querySelectorAll("." + cls).forEach(x => {
    x.checked = arr.includes(x.value);
  });
}

async function loadMenu() {
  const d = await apiGet("getMenuManagerData", {}, 45000);

  if (!d || d.ok === false) {
    document.getElementById("menuBox").innerHTML = fail(d);
    return;
  }

  menuData = (d.menu || []).map(normalizeMenuItem);
  renderMenuList();
}

function active(item) {
  return item.is_active === true || String(item.is_active).toUpperCase() === "TRUE";
}

function renderMenuList() {
  let list = menuData.slice();
  const filter = document.getElementById("menuFilter").value;

  if (filter === "active") list = list.filter(active);
  if (filter === "inactive") list = list.filter(x => !active(x));

  document.getElementById("menuBox").innerHTML = list.length
    ? list.map(renderMenu).join("")
    : '<div class="empty">沒有品項</div>';
}

function renderMenu(item) {
  const isActive = active(item);

  return `
    <div class="card ${isActive ? "" : "inactive"}">
      <div class="name">${esc(item.name)}</div>
      <div class="meta">${esc(item.category)}｜${esc(item.supply_rule)}｜${isActive ? "上架中 ✅" : "已下架 ⛔"}</div>
      <div class="meta">甜度：${esc(item.sweet_options || "無")}｜溫度：${esc(item.temp_options || "無")}</div>
      <div class="price">${money(item.price)}</div>
      <div class="actions">
        <button class="btn-soft" onclick="editMenu('${attr(item.id)}')">修改</button>
        <button class="${isActive ? "btn-danger" : "btn-ok"}" onclick="toggleActive('${attr(item.id)}')">${isActive ? "下架" : "上架"}</button>
      </div>
    </div>`;
}

function editMenu(id) {
  const item = menuData.find(x => String(x.id) === String(id));
  if (!item) return;

  editId.value = item.id || "";
  category.value = item.category || "🍋 其他品項";
  name.value = item.name || "";
  price.value = item.price || "";
  sort.value = item.sort || "";
  supplyRule.value = item.supply_rule || "全年供應";
  note.value = item.note || "";
  imageUrl.value = item.image_url || "";
  customOptions.value = item.custom_options || "";
  setChecked("sweetCk", item.sweet_options || "");
  setChecked("tempCk", item.temp_options || "");

  scrollTo({ top: 0, behavior: "smooth" });
}

async function saveMenuItemUi() {
  const editingId = editId.value.trim();
  const oldItem = editingId ? menuData.find(x => String(x.id) === String(editingId)) : null;

  const p = {
    id: editingId,
    category: category.value.trim(),
    name: name.value.trim(),
    price: Number(price.value || 0),
    sort: Number(sort.value || 999),
    supply_rule: supplyRule.value.trim(),
    note: note.value.trim(),
    image_url: imageUrl.value.trim(),
    sweet_options: getChecked("sweetCk"),
    temp_options: getChecked("tempCk"),
    custom_options: customOptions.value.trim(),

    is_active: oldItem ? oldItem.is_active : true,
    dine_in: oldItem ? oldItem.dine_in : true,
    takeout: oldItem ? oldItem.takeout : true
  };

  if (!p.name) return alert("請輸入品名");

  const r = await apiPost("saveMenuItem", p, 45000);
  if (!r || r.ok === false) {
    alert("儲存失敗：" + (r && r.message ? r.message : ""));
    return;
  }

  alert("已儲存");
  clearForm();
  loadMenu();
}

function clearForm() {
  [editId, name, price, sort, note, imageUrl, customOptions].forEach(e => {
    e.value = "";
  });
  category.value = "🌾 經典古早味";
  supplyRule.value = "全年供應";
  setChecked("sweetCk", "");
  setChecked("tempCk", "");
}

async function toggleActive(id) {
  const item = menuData.find(x => String(x.id) === String(id));
  if (!await showConfirm("確定" + (active(item) ? "下架" : "上架") + "？")) return;

  const r = await apiPost("toggleMenuActive", { id }, 45000);
  if (!r || r.ok === false) {
    alert("更新失敗：" + (r && r.message ? r.message : ""));
    return;
  }

  loadMenu();
}

async function loadOrders(force) {
  if (force) document.getElementById("ordersBox").innerHTML = '<div class="empty">讀取中...</div>';

  const d = await apiGet("getOpenOrders", {}, 45000);
  if (!d || d.ok === false) {
    document.getElementById("ordersBox").innerHTML = fail(d);
    return;
  }

  const oldVersion = String(lastVersion || "");
  const newVersion = String(d.version || "");
  const changed = newVersion !== oldVersion;
  lastVersion = newVersion;

  const tables = d.tables || [];
  document.getElementById("ordersBox").innerHTML = tables.length
    ? tables.map(renderTable).join("")
    : '<div class="empty">目前沒有待處理訂單</div>';

  if (!force && changed && newVersion) {
    bigAlert.textContent = "🔔 有新訂單 / 新加點";
    bigAlert.classList.add("show");
    showToast("🔔 有新訂單 / 新加點");
    setTimeout(() => bigAlert.classList.remove("show"), 2500);
  }
}

function renderTable(table) {
  return `
    <div class="card ${table.all_served ? "all-served" : ""}">
      <div>
        <span class="badge">${esc(table.table_label)}</span>
        <span class="price">${money(table.total_amount)}</span>
      </div>
      ${(table.orders || []).map(order => `
        <div class="card ${order.batch_type === "add" ? "add-batch" : "new-batch"}">
          <div class="batch-title">${esc(order.batch_title || order.batch_label || order.order_id)}</div>
          <div class="meta">${esc(order.created_at || "")}</div>
          ${(order.items || []).map(item => renderItemLine(order.order_id, item)).join("")}
        </div>
      `).join("")}
      <div class="actions">
        <button class="btn-ok" onclick="checkout('${attr(table.table_no)}', 'cash')">💵 現金結單</button>
        <button class="btn-main" onclick="checkout('${attr(table.table_no)}', 'line_pay')">LINE Pay 結單</button>
      </div>
    </div>`;
}

function renderItemLine(orderId, item) {
  const served = item.served === true || String(item.served).toUpperCase() === "TRUE";
  const custom = cleanText(item.custom_text) ? `<div class="meta">(${esc(cleanText(item.custom_text))})</div>` : "";
  const note = cleanText(item.note) ? `<div class="meta">備註：${esc(cleanText(item.note))}</div>` : "";
  const rowId = String(item.item_row_id || "").trim();

  const action = served
    ? "✅"
    : rowId
      ? `<button class="btn-soft" onclick="serve('${attr(orderId)}', '${attr(rowId)}')">出餐</button>`
      : `<span class="meta" style="color:#d9534f;font-weight:900">缺少明細ID</span>`;

  return `
    <div class="order-item-line ${served ? "served" : ""}">
      <div class="order-item-main">・<b>${esc(item.name)} x${esc(item.qty)}</b>${custom}${note}</div>
      ${action}
    </div>`;
}

async function serve(orderId, itemRowId) {
  const r = await apiPost("serveOrderItem", { orderId, itemRowId }, 45000);
  if (!r || r.ok === false) {
    alert("失敗：" + (r && r.message ? r.message : ""));
    return;
  }
  loadOrders(false);
}

async function checkout(tableNo, method) {
  if (!await showConfirm("確定結單？")) return;

  const r = await apiPost("checkoutTable", { tableNo, paymentMethod: method }, 45000);
  if (!r || r.ok === false) {
    alert("結單失敗：" + (r && r.message ? r.message : ""));
    return;
  }

  alert("已結單\n總：" + money(r.gross_amount) + "\n手續費：" + money(r.fee_amount) + "\n淨：" + money(r.net_amount));
  loadOrders(true);
}

async function loadHistory() {
  const d = await apiGet("getTodayHistory", {}, 45000);
  if (!d || d.ok === false) {
    historyBox.innerHTML = fail(d);
    return;
  }

  historyBox.innerHTML = (d.orders || []).length
    ? (d.orders || []).map(order => `
      <div class="card">
        <span class="badge">${esc(order.table_label)}</span> ${esc(order.payment_label || order.status_label)}
        <div class="meta">${esc(order.created_at || "")}</div>
        <div class="items">${esc(order.items_text || "")}</div>
        <div class="price">總 ${money(order.gross_amount || order.total_amount)}｜淨 ${money(order.net_amount || order.total_amount)}</div>
      </div>`).join("")
    : '<div class="empty">今天還沒有紀錄</div>';
}

async function loadReports() {
  const d = await apiGet("getReports", {}, 45000);
  if (!d || d.ok === false) {
    reportsBox.innerHTML = fail(d);
    return;
  }

  feeRate.value = d.settings.line_pay_fee_rate || 0;
  feeFixed.value = d.settings.line_pay_fixed_fee || 0;

  const r = d.today || {};
  reportsBox.innerHTML = `
    <div class="card">
      <div class="report-grid">
        <div class="report-box">今日總營業額<div class="report-num">${money(r.gross)}</div></div>
        <div class="report-box">今日淨金額<div class="report-num">${money(r.net)}</div></div>
        <div class="report-box">現金<div class="report-num">${money(r.cash)}</div></div>
        <div class="report-box">LINE Pay淨額<div class="report-num">${money(r.line_pay_net)}</div></div>
        <div class="report-box">手續費<div class="report-num">${money(r.line_pay_fee)}</div></div>
        <div class="report-box">訂單數<div class="report-num">${r.count || 0}</div></div>
      </div>
    </div>`;
}

async function savePaymentSettings() {
  const r = await apiPost("savePaymentSettings", {
    line_pay_fee_rate: Number(feeRate.value || 0),
    line_pay_fixed_fee: Number(feeFixed.value || 0)
  }, 45000);

  if (!r || r.ok === false) {
    alert("儲存失敗");
    return;
  }

  alert("已儲存");
  loadReports();
}

function fail(d) {
  return `<div class="card" style="color:#d9534f;font-weight:900">讀取失敗：${esc(d && d.message ? d.message : "無資料")}</div>`;
}
