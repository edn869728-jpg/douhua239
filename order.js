const TABLE_NO = qs("table", "A1").trim().toUpperCase();
const LS_SESSION = "douhua_session_" + TABLE_NO;
const LS_PHONE = "douhua_phone_" + TABLE_NO;
const LS_PICKUP = "douhua_pickup_" + TABLE_NO;

let state = { menu: [], cart: { items: [], total: 0 }, openOrders: [], qtyDraft: {}, draftTags: {} };
let addLocks = {};
let submitLock = false;

addEventListener("load", init);

function init() {
  setLogo();
  document.getElementById("shopName").textContent = SHOP_NAME;
  document.getElementById("tableLabel").textContent = TABLE_NO === "TO" ? "外帶" : TABLE_NO + "桌";
  loadData();
}

async function loadData(forceNew = false) {
  const menuBox = document.getElementById("menuBox");
  menuBox.innerHTML = '<div class="empty">讀取菜單中...</div>';

  try {
    const params = {
      table: TABLE_NO,
      clientSessionId: localStorage.getItem(LS_SESSION) || ""
    };
    if (forceNew) params.forceNew = "1";

    const d = await apiGet("getOrderBootstrap", params, 45000);

    if (!d || d.ok === false) {
      menuBox.innerHTML = `<div class="notice" style="color:#d9534f;font-weight:900">讀取失敗：${esc(d && d.message ? d.message : "無資料")}</div>`;
      return;
    }

    if (d.sessionClosed) {
      document.getElementById("closedBox").innerHTML = `
        <div class="card">
          <div class="section-title">此桌次已結束</div>
          <div class="meta">請重新掃描桌上 QR Code，或按下方重新開始。</div>
          <button class="btn-main" onclick="restartSession()">重新開始</button>
        </div>`;
      menuBox.innerHTML = "";
      document.getElementById("cartList").innerHTML = "";
      document.getElementById("cartTotal").textContent = "$0";
      return;
    }

    document.getElementById("closedBox").innerHTML = "";
    if (d.sessionId) localStorage.setItem(LS_SESSION, d.sessionId);

    state = Object.assign(state, d);
    state.cart = state.cart || { items: [], total: 0 };
    state.cart.items = Array.isArray(state.cart.items) ? state.cart.items : [];
    state.menu = Array.isArray(state.menu) ? state.menu : [];

    renderTakeoutBox();
    renderOpenOrders();
    renderMenu();
    renderCart();
  } catch (err) {
    menuBox.innerHTML = `<div class="notice" style="color:#d9534f;font-weight:900">讀取失敗：${esc(err.message || String(err))}</div>`;
  }
}

function restartSession() {
  localStorage.removeItem(LS_SESSION);
  loadData(true);
}

function getTakeoutInfoFromUi() {
  const phoneEl = document.getElementById("takeoutPhone");
  const pickupEl = document.getElementById("pickupTime");
  const phone = phoneEl ? phoneEl.value.trim() : (localStorage.getItem(LS_PHONE) || "");
  const pickupRaw = pickupEl ? pickupEl.value.trim() : (localStorage.getItem(LS_PICKUP) || "");
  return {
    phone,
    pickup: pickupRaw || "現場等候"
  };
}

function saveTakeoutLocal() {
  if (TABLE_NO !== "TO") return { phone: "", pickup: "" };
  const info = getTakeoutInfoFromUi();
  if (info.phone) localStorage.setItem(LS_PHONE, info.phone);
  else localStorage.removeItem(LS_PHONE);
  localStorage.setItem(LS_PICKUP, info.pickup || "現場等候");
  return info;
}

async function syncTakeoutInfo(silent = true) {
  if (TABLE_NO !== "TO") return { ok: true };
  const info = saveTakeoutLocal();
  if (!info.phone) return { ok: true, phone: "", pickup: info.pickup || "現場等候" };

  try {
    const res = await apiPost("updateSessionInfo", {
      tableNo: TABLE_NO,
      sessionId: localStorage.getItem(LS_SESSION) || "",
      customer_phone: info.phone,
      phone: info.phone,
      customerPhone: info.phone,
      pickup_time: info.pickup || "現場等候",
      pickupTime: info.pickup || "現場等候",
      takeout_note: "電話：" + info.phone + "｜取餐：" + (info.pickup || "現場等候")
    }, 45000);
    if (!silent) alert(res && res.ok ? "已儲存外帶資料" : "儲存失敗：" + (res && res.message ? res.message : ""));
    return res || { ok: true };
  } catch (err) {
    if (!silent) alert("儲存失敗：" + (err && err.message ? err.message : err));
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

function renderTakeoutBox() {
  const box = document.getElementById("takeoutBox");
  if (TABLE_NO !== "TO") {
    box.innerHTML = "";
    return;
  }

  const phone = localStorage.getItem(LS_PHONE) || "";
  const pickup = localStorage.getItem(LS_PICKUP) || "";
  const pickupValue = pickup === "現場等候" ? "" : pickup;

  box.innerHTML = `
    <div class="card takeout-box">
      <div class="section-title">🥡 外帶資料</div>
      <div class="meta">手機可填可不填；取餐時間不填就是「現場等候」。</div>
      <label>手機號碼</label>
      <input id="takeoutPhone" value="${attr(phone)}" placeholder="09xxxxxxxx，可不填">
      <label>預計取餐時間</label>
      <input id="pickupTime" value="${attr(pickupValue)}" placeholder="不填＝現場等候，例如 15:30">
      <button class="btn-main" onclick="saveTakeoutInfo()">儲存外帶資料</button>
    </div>`;
}

async function saveTakeoutInfo() {
  await syncTakeoutInfo(false);
}

function renderMenu() {
  const menuBox = document.getElementById("menuBox");
  const menu = (state.menu || []).filter(x => x && x.id && x.name);

  if (!menu.length) {
    menuBox.innerHTML = '<div class="empty">目前沒有上架菜單</div>';
    return;
  }

  const groups = {};
  menu.forEach(item => {
    const cat = item.category || "其他";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  let html = "";
  Object.keys(groups).forEach(cat => {
    html += `<div class="cat-title">${esc(cat)}</div>`;
    groups[cat].forEach(item => {
      html += renderItem(item);
    });
  });

  menuBox.innerHTML = html;
}

function renderItem(item) {
  const q = Number(state.qtyDraft[item.id] ?? 1);
  const imageHtml = item.image_url
    ? `<img class="item-img" src="${attr(item.image_url)}" onerror="this.outerHTML='<div class=&quot;item-img empty&quot;>🍨</div>'">`
    : `<div class="item-img empty">🍨</div>`;

  return `
    <div class="card item compact-item">
      ${imageHtml}
      <div class="item-body">
        <div class="name">${esc(item.name)}</div>
        <div class="meta compact-meta">${esc(item.note || item.supply_rule || "")}</div>
        <div class="price">${money(item.price)}</div>
        ${renderTagGroups(item)}
        <input class="note-input compact-note" id="note-${attr(item.id)}" placeholder="備註，可不填">
        <div class="qty-row compact-qty-row">
          <button class="btn-soft" onclick="draftQty('${attr(item.id)}', -1)">-</button>
          <div class="qty-num" id="qty-${attr(item.id)}">${q}</div>
          <button class="btn-soft" onclick="draftQty('${attr(item.id)}', 1)">+</button>
          <button class="btn-main" id="addbtn-${attr(item.id)}" onclick="addDraftItem('${attr(item.id)}')">加入</button>
        </div>
      </div>
    </div>`;
}

function renderTagGroups(item) {
  const sweet = csvToArray(item.sweet_options);
  const temp = csvToArray(item.temp_options);
  const custom = csvToArray(item.custom_options);

  let html = "";
  if (sweet.length) html += renderOneTagGroup(item.id, "sweet", sweet, false);
  if (temp.length) html += renderOneTagGroup(item.id, "temp", temp, false);
  if (custom.length) html += renderOneTagGroup(item.id, "custom", custom, true);
  return html;
}

function renderOneTagGroup(id, group, arr, multi) {
  const selected = ((state.draftTags[id] || {})[group]) || (multi ? [] : "");

  return `
    <div class="tag-group compact">
      <div class="tag-buttons">
        ${arr.map(t => {
          const on = multi ? selected.includes(t) : selected === t;
          return `<button class="tag-btn ${on ? "active" : ""}" onclick="selectTag(event, '${attr(id)}', '${group}', '${attr(t)}', ${multi ? "true" : "false"})">${esc(t)}</button>`;
        }).join("")}
      </div>
    </div>`;
}

function selectTag(e, id, group, value, multi) {
  e.preventDefault();

  if (!state.draftTags[id]) state.draftTags[id] = {};

  if (multi) {
    let arr = state.draftTags[id][group] || [];
    arr = arr.includes(value) ? arr.filter(x => x !== value) : arr.concat(value);
    state.draftTags[id][group] = arr;
  } else {
    state.draftTags[id][group] = state.draftTags[id][group] === value ? "" : value;
  }

  renderMenu();
}

function getTagsForItem(id) {
  const t = state.draftTags[id] || {};
  const out = [];

  if (t.sweet) out.push(t.sweet);
  if (t.temp) out.push(t.temp);
  if (Array.isArray(t.custom)) t.custom.forEach(x => out.push(x));

  return out;
}

function draftQty(id, diff) {
  const base = Number(state.qtyDraft[id] ?? 1);
  state.qtyDraft[id] = Math.max(1, base + diff);

  const el = document.getElementById("qty-" + id);
  if (el) el.textContent = state.qtyDraft[id];
}

async function addDraftItem(id) {
  if (addLocks[id]) return;

  const qty = Number(state.qtyDraft[id] ?? 1);
  if (qty < 1) {
    alert("數量最低為 1");
    return;
  }

  const takeoutInfo = TABLE_NO === "TO" ? saveTakeoutLocal() : { phone: "", pickup: "" };

  const btn = document.getElementById("addbtn-" + id);
  addLocks[id] = true;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "加入中";
  }

  showToast("加入中，請稍候…");

  try {
    if (TABLE_NO === "TO") await syncTakeoutInfo(true);

    const noteEl = document.getElementById("note-" + id);
    const tags = getTagsForItem(id);

    const res = await apiPost("addCartItem", {
      tableNo: TABLE_NO,
      sessionId: localStorage.getItem(LS_SESSION) || "",
      itemId: id,
      qty,
      note: noteEl ? noteEl.value : "",
      custom_tags: tags.join(" / "),
      customer_phone: takeoutInfo.phone || "",
      phone: takeoutInfo.phone || "",
      customerPhone: takeoutInfo.phone || "",
      pickup_time: takeoutInfo.pickup || "現場等候",
      pickupTime: takeoutInfo.pickup || "現場等候"
    }, 45000);

    if (!res || res.ok === false) {
      alert("加入失敗：" + (res && res.message ? res.message : ""));
      return;
    }

    state.qtyDraft[id] = 1;
    state.draftTags[id] = {};
    if (noteEl) noteEl.value = "";

    if (res.sessionId) localStorage.setItem(LS_SESSION, res.sessionId);
    if (res.cart) {
      state.cart = res.cart;
      renderCart();
      const qtyEl = document.getElementById("qty-" + id);
      if (qtyEl) qtyEl.textContent = "1";
    } else {
      await loadData();
    }

    showToast("✅ 已加入購物車");
  } catch (err) {
    alert("加入失敗：" + (err && err.message ? err.message : err));
  } finally {
    addLocks[id] = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "加入";
    }
  }
}

function recalcCart() {
  state.cart = state.cart || { items: [], total: 0 };
  state.cart.items = Array.isArray(state.cart.items) ? state.cart.items : [];
  state.cart.total = state.cart.items.reduce((sum, item) => {
    item.subtotal = Number(item.price || 0) * Number(item.qty || 0);
    return sum + Number(item.subtotal || 0);
  }, 0);
}

function renderCart() {
  const c = state.cart || { items: [], total: 0 };
  const items = c.items || [];

  document.getElementById("cartTotal").textContent = money(c.total);
  document.getElementById("cartCount").textContent = items.length ? "(" + items.length + ")" : "";

  if (!items.length) {
    document.getElementById("cartList").innerHTML = '<div class="empty">目前沒有準備送出的品項</div>';
    return;
  }

  document.getElementById("cartList").innerHTML = items.map(i => {
    const subLines = [];
    if (cleanText(i.custom_text)) subLines.push(cleanText(i.custom_text));
    if (cleanText(i.note)) subLines.push("備註：" + cleanText(i.note));

    const nextMinus = Math.max(1, Number(i.qty) - 1);

    return `
      <div class="cart-line">
        <div>
          <div class="cart-item-title">${esc(i.name)}</div>
          ${subLines.length ? `<div class="cart-item-sub">${esc(subLines.join("｜"))}</div>` : ""}
          <div class="cart-item-sub">${money(i.price)} × ${esc(i.qty)}</div>
        </div>
        <div>
          <button class="btn-soft" onclick="changeQty(event, '${attr(i.cart_id)}', ${nextMinus})">-</button>
          <button class="btn-soft" onclick="changeQty(event, '${attr(i.cart_id)}', ${Number(i.qty) + 1})">+</button><br>
          <button class="btn-danger" style="margin-top:6px" onclick="removeCartItem(event, '${attr(i.cart_id)}')">移除</button>
        </div>
      </div>`;
  }).join("");
}

function renderOpenOrders() {
  const orders = state.openOrders || [];
  const box = document.getElementById("openOrdersBox");

  if (!orders.length) {
    box.innerHTML = "";
    return;
  }

  let html = '<div class="orders-box"><b>✅ 已送出給店家</b>';
  orders.forEach(order => {
    const info = [];
    if (cleanText(order.customer_phone || order.phone)) info.push("電話：" + cleanText(order.customer_phone || order.phone));
    if (cleanText(order.pickup_time || order.pickupTime)) info.push("取餐：" + cleanText(order.pickup_time || order.pickupTime));
    html += `
      <div class="cart-line sent">
        <div><b>${esc(order.batch_label || order.order_id)}</b><br>${info.length ? esc(info.join("｜")) + "<br>" : ""}${esc(order.items_text || "")}</div>
        <div>${money(order.total_amount)}</div>
      </div>`;
  });
  html += "</div>";

  box.innerHTML = html;
}

async function removeCartItem(e, id) {
  e.stopPropagation();
  if (!await showConfirm("確定移除這個品項？")) return;
  await changeQty(e, id, 0);
}

async function changeQty(e, id, qty) {
  e.stopPropagation();

  state.cart = state.cart || { items: [], total: 0 };
  state.cart.items = Array.isArray(state.cart.items) ? state.cart.items : [];

  const oldItems = JSON.parse(JSON.stringify(state.cart.items));
  const oldTotal = state.cart.total;
  const idx = state.cart.items.findIndex(x => String(x.cart_id) === String(id));

  if (idx >= 0) {
    if (qty <= 0) {
      state.cart.items.splice(idx, 1);
    } else {
      state.cart.items[idx].qty = qty;
      state.cart.items[idx].subtotal = Number(state.cart.items[idx].price || 0) * Number(qty || 0);
    }

    recalcCart();
    renderCart();
  }

  try {
    const r = await apiPost("updateCartQty", { cartId: id, qty }, 45000);
    if (!r || r.ok === false) {
      state.cart.items = oldItems;
      state.cart.total = oldTotal;
      renderCart();
      alert("更新失敗：" + (r && r.message ? r.message : ""));
    }
  } catch (err) {
    state.cart.items = oldItems;
    state.cart.total = oldTotal;
    renderCart();
    alert("更新失敗：" + (err && err.message ? err.message : err));
  }
}

async function clearCartUi(e) {
  e.stopPropagation();

  if (!await showConfirm("確定清空目前購物車？")) return;

  const oldCart = JSON.parse(JSON.stringify(state.cart || { items: [], total: 0 }));
  state.cart = { items: [], total: 0 };
  renderCart();

  try {
    const r = await apiPost("clearCart", {
      tableNo: TABLE_NO,
      sessionId: localStorage.getItem(LS_SESSION) || ""
    }, 45000);

    if (!r || r.ok === false) {
      state.cart = oldCart;
      renderCart();
      alert("清空失敗：" + (r && r.message ? r.message : ""));
    }
  } catch (err) {
    state.cart = oldCart;
    renderCart();
    alert("清空失敗：" + (err && err.message ? err.message : err));
  }
}

async function submitOrder(e) {
  e.stopPropagation();

  if (submitLock) return;

  if (!state.cart || !Array.isArray(state.cart.items) || !state.cart.items.length) {
    await loadData();
  }

  if (!state.cart || !Array.isArray(state.cart.items) || !state.cart.items.length) {
    alert("購物車是空的，請先加入商品");
    return;
  }

  const takeoutInfo = TABLE_NO === "TO" ? saveTakeoutLocal() : { phone: "", pickup: "" };

  if (!await showConfirm("確定送出訂單？")) return;

  submitLock = true;
  const btn = document.getElementById("submitBtn");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "送出中";
  }

  showToast("送出中，請稍候…");

  try {
    if (TABLE_NO === "TO") await syncTakeoutInfo(true);

    const r = await apiPost("submitCart", {
      tableNo: TABLE_NO,
      sessionId: localStorage.getItem(LS_SESSION) || "",
      customer_phone: takeoutInfo.phone || "",
      phone: takeoutInfo.phone || "",
      customerPhone: takeoutInfo.phone || "",
      pickup_time: takeoutInfo.pickup || "現場等候",
      pickupTime: takeoutInfo.pickup || "現場等候",
      takeout_note: TABLE_NO === "TO" ? ("電話：" + (takeoutInfo.phone || "未填") + "｜取餐：" + (takeoutInfo.pickup || "現場等候")) : ""
    }, 45000);

    if (!r || r.ok === false) {
      alert("送出失敗：" + (r && r.message ? r.message : ""));
      return;
    }

    state.cart = { items: [], total: 0 };
    renderCart();
    showToast("✅ 已送出給店家");
    await loadData();
  } catch (err) {
    alert("送出失敗：" + (err && err.message ? err.message : err));
  } finally {
    submitLock = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "確認送出";
    }
  }
}
