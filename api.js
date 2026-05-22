const DOUHUA = window.DOUHUA_CONFIG || {};
const API_URL = DOUHUA.API_URL;
const SHOP_NAME = DOUHUA.SHOP_NAME || "逗花•豆花";
const LOGO_URL = DOUHUA.LOGO_URL || "";

function qs(name, fallback = "") {
  return new URLSearchParams(location.search).get(name) || fallback;
}
function esc(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function attr(value) {
  return esc(value).replaceAll("`", "&#096;");
}
function money(n) {
  return "$" + Math.round(Number(n || 0));
}
function csvToArray(v) {
  return String(v || "").split(/[,，、/\n]+/).map(x => x.trim()).filter(Boolean);
}
function isDateGarbage(v) {
  const s = String(v || "");
  return /GMT\+\d{4}|台北標準時間|標準時間|^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}\s\d{4}/.test(s);
}
function cleanText(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (isDateGarbage(s)) return "";
  if (s.includes("__web-inspector-hide-shortcut__")) return "";
  return s;
}
function normalizeApiData(d) {
  if (!d || typeof d !== "object") return d || {};
  if (!d.cart && d["購物車"]) d.cart = d["購物車"];

  if (Array.isArray(d.menu)) d.menu = d.menu.map(normalizeMenuItem);

  if (d.cart && Array.isArray(d.cart.items)) {
    d.cart.items = d.cart.items.map(normalizeCartItem).filter(x => x.name);
    d.cart.total = Number(
      d.cart.total ||
      d.cart["總計"] ||
      d.cart["合計"] ||
      d.cart.items.reduce((s, x) => s + Number(x.subtotal || 0), 0)
    );
  } else if (!d.cart) {
    d.cart = { items: [], total: 0 };
  }

  if (Array.isArray(d.openOrders)) {
    d.openOrders = d.openOrders.map(o => ({
      order_id: o.order_id || o["訂單編號"] || "",
      batch_label: o.batch_label || o["批次"] || "",
      items_text: o.items_text || o["明細"] || "",
      total_amount: Number(o.total_amount || o["總金額"] || 0),
      customer_phone: o.customer_phone || o.phone || o.customerPhone || "",
      pickup_time: o.pickup_time || o.pickupTime || ""
    }));
  }
  return d;
}
function normalizeMenuItem(i) {
  i = i || {};
  const imageFromCustom = /^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(String(i.custom_options || ""))
    ? String(i.custom_options || "")
    : "";
  return {
    id: String(i.id || i.ID || i["ID"] || ""),
    category: String(i.category || i["類別"] || "其他"),
    name: String(i.name || i["名稱"] || i["品名"] || ""),
    price: Number(i.price || i["價格"] || 0),
    supply_rule: String(i.supply_rule || i["供應規則"] || ""),
    is_active: i.is_active === true || String(i.is_active || i["上架"] || "").toLowerCase() === "true",
    dine_in: i.dine_in !== false,
    takeout: i.takeout !== false,
    note: String(i.note || i["備註"] || ""),
    sort: Number(i.sort || i["排序"] || 9999),
    image_url: String(i.image_url || i["圖片"] || imageFromCustom || ""),
    sweet_options: String(i.sweet_options || i["甜度"] || ""),
    temp_options: String(i.temp_options || i["溫度"] || i["冰量"] || ""),
    custom_options: imageFromCustom ? "" : String(i.custom_options || i["客製化"] || "")
  };
}
function normalizeCartItem(i) {
  i = i || {};
  const customText = cleanText(i.custom_text || i.custom_tags || "");
  const note = cleanText(i.note || i["備註"] || "");
  const qty = Math.max(1, Number(i.qty || i["數量"] || 1));
  const price = Number(i.price || i["價格"] || 0);
  const firstCartId = Array.isArray(i.cart_ids) && i.cart_ids.length ? i.cart_ids[0] : "";
  return {
    cart_id: String(i.cart_id || firstCartId || i["購物車ID"] || ""),
    cart_ids: Array.isArray(i.cart_ids) ? i.cart_ids : [],
    item_id: String(i.item_id || ""),
    name: cleanText(i.name || i["名稱"] || i["品名"]),
    price,
    qty,
    note,
    custom_tags: cleanText(i.custom_tags || ""),
    custom_text: customText,
    image_url: String(i.image_url || i["圖片"] || ""),
    subtotal: Number(i.subtotal || i["小計"] || price * qty)
  };
}
async function apiGet(action, params = {}, timeoutMs = 30000) {
  if (!API_URL) throw new Error("缺少 API_URL");
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" }, timeoutMs)
    .then(parseJson)
    .then(normalizeApiData);
}
async function apiPost(action, payload = {}, timeoutMs = 30000) {
  if (!API_URL) throw new Error("缺少 API_URL");
  return fetchWithTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action }, payload))
  }, timeoutMs).then(parseJson).then(normalizeApiData);
}
async function fetchWithTimeout(url, options, timeoutMs) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: c.signal }));
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if ((err && err.name === "AbortError") || msg.includes("aborted")) {
      throw new Error("API 逾時：後端回應太久，請稍後再試。");
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}
async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, message: "API 不是 JSON：" + text.slice(0, 220) };
  }
}
function setLogo() {
  const img = document.getElementById("logo");
  const fb = document.getElementById("logoFallback");
  if (!img) return;
  if (!LOGO_URL) {
    img.style.display = "none";
    if (fb) fb.style.display = "flex";
    return;
  }
  img.src = LOGO_URL + (LOGO_URL.includes("?") ? "&" : "?") + "v=" + Date.now();
  img.onerror = () => {
    img.style.display = "none";
    if (fb) fb.style.display = "flex";
  };
}
let __toastTimer = null;
function showToast(message) {
  let el = document.getElementById("appToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToast";
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = String(message || "");
  el.classList.add("show");
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
window.alert = function(message) {
  showToast(message);
};
function showConfirm(message, title = "確認操作") {
  return new Promise(resolve => {
    let mask = document.getElementById("appConfirmMask");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "appConfirmMask";
      mask.className = "app-confirm-mask";
      mask.innerHTML =
        '<div class="app-confirm-box">' +
          '<div class="app-confirm-title" id="appConfirmTitle"></div>' +
          '<div class="app-confirm-message" id="appConfirmMsg"></div>' +
          '<div class="app-confirm-actions">' +
            '<button class="btn-soft" id="appConfirmCancel">取消</button>' +
            '<button class="btn-main" id="appConfirmOk">確定</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(mask);
    }
    document.getElementById("appConfirmTitle").textContent = title;
    document.getElementById("appConfirmMsg").textContent = String(message || "");
    mask.classList.add("show");
    const done = (value) => {
      mask.classList.remove("show");
      resolve(value);
    };
    document.getElementById("appConfirmCancel").onclick = () => done(false);
    document.getElementById("appConfirmOk").onclick = () => done(true);
    mask.onclick = (e) => { if (e.target === mask) done(false); };
  });
}
