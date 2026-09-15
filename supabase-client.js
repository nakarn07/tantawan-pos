/**
 * =========================================================================
 * TANTAWAN COFFEE & CAFÉ - SUPABASE CLOUD & REALTIME CLIENT
 * =========================================================================
 * จัดการการเชื่อมต่อฐานข้อมูลบน Cloud, ซิงค์ยอดขาย, และเชื่อมสัญญาณ Realtime
 * ระหว่างหน้าจอผู้ขาย (index.html) และหน้าจอลูกค้า (customer.html) ข้ามอุปกรณ์
 */

const SUPABASE_CONFIG = {
  url: 'https://gvsxlrvgaalotksccyxg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hscnZnYWFsb3Rrc2NjeXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTY5NTksImV4cCI6MjEwNDk5Mjk1OX0.vVAPzWbYPAVUOeIV3j7YtrWqFSxQUih49Z4gkg-VMHs'
};

let dbClient = null;
let realtimeChannel = null;
let isCloudConnected = false;
let cloudSyncListeners = [];
let isSyncingProductsLocally = false;
let localProductSyncTimer = null;
let realtimeFetchTimeout = null;

// 1. INITIALIZE SUPABASE CLIENT
function initSupabase() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      dbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: false },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      isCloudConnected = true;
      initRealtimeChannel();
      initDbChangeListener();
      notifyCloudStatus(true);
      console.log('✅ Supabase Client Initialized Successfully');
      
      // Auto sync pending orders after init
      setTimeout(syncAllPendingOrders, 1500);

      // Proactively purge unwanted mock categories & products from Cloud DB
      try {
        dbClient.from('products').delete().in('id', ['prod-7', 'prod-8', 'prod-affogato', 'prod-dirty', 'prod-9', 'prod-11', 'prod-12', 'prod-1']).then(() => {}).catch(() => {});
        dbClient.from('categories').delete().in('name', ['กาแฟ', 'ชา', 'เบเกอรี่']).then(() => {}).catch(() => {});
      } catch (e) {}
    } catch (err) {
      console.warn('⚠️ Supabase Init Warning:', err);
      isCloudConnected = false;
      notifyCloudStatus(false);
    }
  } else {
    setTimeout(initSupabase, 500);
  }
}

// 2. REALTIME CHANNEL SETUP (ข้ามเครื่อง ข้ามเครือข่าย)
function initRealtimeChannel() {
  if (!dbClient) return;

  try {
    realtimeChannel = dbClient.channel('tantawan-pos-realtime', {
      config: { broadcast: { self: false } }
    });

    realtimeChannel
      .on('broadcast', { event: 'display-event' }, (payload) => {
        if (payload && payload.payload) {
          // ส่งต่อให้ฟังก์ชันหน้าจอลูกค้า handleDisplayEvent
          if (typeof window.handleDisplayEvent === 'function') {
            window.handleDisplayEvent(payload.payload);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Connected to Supabase Realtime Channel: tantawan-pos-realtime');
          notifyCloudStatus(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('📡 Realtime status:', status);
        }
      });
  } catch (err) {
    console.error('Realtime Channel Error:', err);
  }
}

// 2.1 REALTIME DATABASE LISTENER (ซิงค์ยอดขายระหว่างเครื่องแบบเรียลไทม์)
function initDbChangeListener() {
  if (!dbClient) return;

  try {
    dbClient
      .channel('tantawan-db-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('📡 Realtime DB change received:', payload.eventType);
        if (payload.eventType === 'INSERT' && payload.new) {
          const newOrd = {
            id: payload.new.id,
            orderNumber: payload.new.order_number,
            createdAt: payload.new.created_at,
            dateStr: payload.new.date_str,
            timeStr: payload.new.time_str,
            date: payload.new.date_str,
            time: payload.new.time_str,
            timestamp: new Date(payload.new.created_at).getTime(),
            items: payload.new.items || [],
            subtotal: Number(payload.new.subtotal || 0),
            discount: Number(payload.new.discount || 0),
            total: Number(payload.new.total || 0),
            paymentMethod: payload.new.payment_method || 'cash',
            cashReceived: Number(payload.new.cash_received || 0),
            cashChange: Number(payload.new.change_amount || 0),
            changeAmount: Number(payload.new.change_amount || 0),
            cashierId: payload.new.cashier_id,
            cashierName: payload.new.cashier_name,
            shiftId: payload.new.shift_id,
            notes: payload.new.notes,
            status: payload.new.status || 'completed'
          };
          if (window.orders && !window.orders.some(o => o.id === newOrd.id)) {
            window.orders.unshift(newOrd);
            try {
              localStorage.setItem('coffeeshop_orders', JSON.stringify(window.orders));
            } catch (e) {}
            if (typeof window.renderRecentOrders === 'function') window.renderRecentOrders();
            if (typeof window.calculateReportStats === 'function') window.calculateReportStats();
            if (typeof window.updateDashboardStats === 'function') window.updateDashboardStats();
          }
        }
      })
      .subscribe();

    // 2.2 REALTIME PRODUCTS SYNC (ซิงค์เมนูข้ามเครื่องทันทีที่กดบันทึก)
    dbClient
      .channel('tantawan-products-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        console.log('📡 Realtime Product DB change received:', payload.eventType);
        // If this device just performed the local sync, skip self-triggered refresh to prevent bounce-back
        if (isSyncingProductsLocally) {
          console.log('⏳ Skipping self-triggered product realtime refresh');
          return;
        }
        if (realtimeFetchTimeout) clearTimeout(realtimeFetchTimeout);
        realtimeFetchTimeout = setTimeout(() => {
          if (typeof fetchProductsFromCloud === 'function') {
            fetchProductsFromCloud().then(cloudProds => {
              if (cloudProds && cloudProds.length > 0) {
                window.products = cloudProds;
                if (typeof products !== 'undefined') products = cloudProds;
                if (typeof renderProductsGrid === 'function') renderProductsGrid();
                if (typeof renderMenuConfigTable === 'function') renderMenuConfigTable();
              }
            });
          }
        }, 600);
      })
      .subscribe();
  } catch (err) {
    console.warn('DB Change Listener Error:', err);
  }
}

// 3. BROADCAST DISPLAY EVENTS TO CUSTOMER SCREEN
// ส่งสัญญาณจากแคชเชียร์ไปยังหน้าจอลูกค้า (ทำงานทั้งข้ามเครื่องผ่านเน็ต และในเครื่องเดียวกัน)
function broadcastToCustomerScreen(eventData) {
  if (!eventData) return;

  // 3.1 ส่งผ่าน Supabase Realtime (สำหรับเปิดคนละเครื่อง เช่น iPad แคชเชียร์ + จอลูกค้าหน้าร้าน)
  if (realtimeChannel && isCloudConnected) {
    realtimeChannel.send({
      type: 'broadcast',
      event: 'display-event',
      payload: eventData
    }).catch(err => console.warn('Supabase Realtime Send Error:', err));
  }

  // 3.2 ส่งผ่าน Local BroadcastChannel (สำหรับเปิด 2 จอบน PC เครื่องเดียวกัน ไวสุดไม่พึ่งเน็ต)
  try {
    if (window.__localDisplayChannel) {
      window.__localDisplayChannel.postMessage(eventData);
    }
  } catch (e) {}

  // 3.3 ส่งผ่าน LocalStorage Fallback
  try {
    localStorage.setItem('tantawan_customer_display_event', JSON.stringify({
      ...eventData,
      _syncTimestamp: Date.now()
    }));
  } catch (e) {}
}

// 4. CLOUD DATABASE SYNC: ORDERS (บันทึกและซิงค์บิลขาย)
async function syncOrderToCloud(order) {
  if (!order) return false;

  // เซฟในเครื่อง (Local First) ก่อนเสมอ เพื่อให้ขายได้ตลอดเวลาแม้ออฟไลน์
  try {
    const localOrders = JSON.parse(localStorage.getItem('coffeeshop_orders')) || [];
    const exists = localOrders.some(o => o.id === order.id);
    if (!exists) {
      localOrders.unshift(order);
      localStorage.setItem('coffeeshop_orders', JSON.stringify(localOrders));
    }
  } catch (e) {}

  // หากไม่มี Cloud Client ให้คืนค่าไว้ซิงค์ภายหลัง
  if (!dbClient || !isCloudConnected) {
    markOrderPendingSync(order);
    return false;
  }

  try {
    const row = {
      id: String(order.id),
      order_number: String(order.orderNumber || order.id),
      created_at: order.createdAt || (order.timestamp ? new Date(order.timestamp).toISOString() : new Date().toISOString()),
      date_str: order.dateStr || (order.date ? order.date : new Date().toLocaleDateString('th-TH')),
      time_str: order.timeStr || (order.time ? order.time : new Date().toLocaleTimeString('th-TH')),
      items: order.items || [],
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      payment_method: order.paymentMethod || 'cash',
      cash_received: Number(order.cashReceived || 0),
      change_amount: Number(order.cashChange || order.changeAmount || 0),
      cashier_id: order.cashierId || 'user-owner',
      cashier_name: order.cashierName || 'เจ้าของร้าน',
      shift_id: order.shiftId || null,
      notes: order.notes || '',
      status: order.status || 'completed'
    };

    const { error } = await dbClient.from('orders').upsert(row);
    if (error) {
      console.warn('⚠️ Order upload failed, queued for retry:', error.message);
      markOrderPendingSync(order);
      return false;
    } else {
      removeOrderPendingSync(order.id);
      console.log('☁️ Order synced to Supabase successfully:', order.id);
      return true;
    }
  } catch (err) {
    console.error('Error syncing order to Supabase:', err);
    markOrderPendingSync(order);
    return false;
  }
}

// คิวสำหรับบิลที่ยังไม่ได้ซิงค์ (ทำงานอัตโนมัติเมื่อกลับมาต่อเน็ต)
function markOrderPendingSync(order) {
  try {
    const pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    if (!pending.some(p => p.id === order.id)) {
      pending.push(order);
      localStorage.setItem('pending_cloud_orders', JSON.stringify(pending));
    }
  } catch (e) {}
}

function removeOrderPendingSync(orderId) {
  try {
    let pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    pending = pending.filter(p => p.id !== orderId);
    localStorage.setItem('pending_cloud_orders', JSON.stringify(pending));
  } catch (e) {}
}

// 5. SYNC ALL PENDING ORDERS WHEN ONLINE
async function syncAllPendingOrders() {
  if (!dbClient || !isCloudConnected) return;

  try {
    const pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    if (pending.length === 0) return;

    console.log(`🔄 Syncing ${pending.length} pending orders to Supabase...`);
    for (const ord of pending) {
      await syncOrderToCloud(ord);
    }
  } catch (e) {}
}

// 6. FETCH ORDERS FROM CLOUD ON STARTUP
async function fetchOrdersFromCloud() {
  if (!dbClient || !isCloudConnected) return null;

  try {
    const { data, error } = await dbClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.warn('Could not fetch orders from Supabase:', error.message);
      return null;
    }

    if (Array.isArray(data) && data.length > 0) {
      // แปลงข้อมูลกลับเป็นรูปแบบที่ระบบ POS ใช้
      const formatted = data.map(row => ({
        id: row.id,
        orderNumber: row.order_number,
        createdAt: row.created_at,
        dateStr: row.date_str,
        timeStr: row.time_str,
        date: row.date_str,
        time: row.time_str,
        timestamp: new Date(row.created_at).getTime(),
        items: row.items,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        paymentMethod: row.payment_method,
        cashReceived: Number(row.cash_received),
        cashChange: Number(row.change_amount),
        changeAmount: Number(row.change_amount),
        cashierId: row.cashier_id,
        cashierName: row.cashier_name,
        shiftId: row.shift_id,
        notes: row.notes,
        status: row.status
      }));

      // Merge กับ Local
      localStorage.setItem('coffeeshop_orders', JSON.stringify(formatted));
      return formatted;
    }
  } catch (err) {
    console.error('fetchOrdersFromCloud error:', err);
  }
  return null;
}

// 7. SYNC PRODUCTS TO CLOUD
async function syncProductsToCloud(prods) {
  if (!dbClient || !isCloudConnected || !Array.isArray(prods)) return;
  try {
    // Set local sync lock for 3 seconds so incoming realtime echo won't overwrite active user changes
    isSyncingProductsLocally = true;
    if (localProductSyncTimer) clearTimeout(localProductSyncTimer);
    localProductSyncTimer = setTimeout(() => {
      isSyncingProductsLocally = false;
    }, 3000);

    const BANNED_IDS = ['prod-7', 'prod-8', 'prod-affogato', 'prod-dirty', 'prod-9', 'prod-11', 'prod-12', 'prod-1'];
    const cleanProds = prods.filter(p => !BANNED_IDS.includes(p.id));
    const orderedIds = cleanProds.map(p => p.id);
    localStorage.setItem('coffeeshop_product_order', JSON.stringify(orderedIds));

    const rows = cleanProds.map(p => ({
      id: String(p.id),
      name: p.name,
      category: p.category,
      base_price: Number(p.basePrice || 0),
      image: p.image || null,
      option_group_ids: p.optionGroupIds || [],
      has_temp: !!p.hasTemp,
      temp_prices: p.tempPrices || { hot: 0, cold: 5, frappe: 10 },
      has_sweetness: !!p.hasSweetness,
      has_extras: !!p.hasExtras,
      extras: p.extras || [],
      active: p.active !== false
    }));
    await dbClient.from('products').upsert(rows);

    // Save custom product order to shop_settings so it is permanently preserved across cloud and all devices
    await dbClient.from('shop_settings').upsert({
      key: 'product_order',
      value: orderedIds
    });

    console.log('☁️ Products and custom order synced to Supabase (' + rows.length + ' items)');
  } catch (e) {
    console.warn('Sync products error:', e);
  }
}

// 7.1 FETCH PRODUCTS FROM CLOUD
async function fetchProductsFromCloud() {
  if (!dbClient || !isCloudConnected) return null;
  try {
    const { data, error } = await dbClient
      .from('products')
      .select('*')
      .eq('active', true);

    if (error) {
      console.warn('Could not fetch products from Supabase:', error.message);
      return null;
    }

    if (Array.isArray(data) && data.length > 0) {
      const BANNED_IDS = ['prod-7', 'prod-8', 'prod-affogato', 'prod-dirty', 'prod-9', 'prod-11', 'prod-12', 'prod-1'];
      // 1. Sanitize products
      let formatted = data
        .filter(row => !BANNED_IDS.includes(row.id) && row.category !== 'เบเกอรี่' && !(row.name || '').includes('บลูเบอร์รี่') && !(row.name || '').includes('ครัวซองต์'))
        .map(row => {
          let cat = row.category;
          if (cat === 'กาแฟ') {
            cat = (row.name && (row.name.includes('ร้อน') || row.name.includes('Hot'))) ? 'กาแฟร้อน' : 'กาแฟเย็น';
          } else if (cat === 'ชา') {
            cat = 'เครื่องดื่มอื่นๆ';
          } else if (cat === 'เบเกอรี่') {
            cat = 'ของกินอื่นๆ';
          }
          let name = row.name;
          if (row.id === 'prod-1789379487270' && name === 'ลิ้ยจี่โซดา') {
            name = 'ลิ้นจี่โซดา';
          }
          return {
            id: row.id,
            name: name,
            category: cat,
            basePrice: Number(row.base_price || 0),
            image: row.image,
            optionGroupIds: row.option_group_ids || [],
            hasTemp: !!row.has_temp,
            tempPrices: row.temp_prices || { hot: 0, cold: 5, frappe: 10 },
            hasSweetness: !!row.has_sweetness,
            hasExtras: !!row.has_extras,
            extras: row.extras || [],
            active: row.active !== false
          };
        });

      // 2. Fetch custom product order from Supabase shop_settings or localStorage
      let productOrder = null;
      try {
        const { data: orderRow } = await dbClient
          .from('shop_settings')
          .select('value')
          .eq('key', 'product_order')
          .maybeSingle();
        if (orderRow && Array.isArray(orderRow.value) && orderRow.value.length > 0) {
          productOrder = orderRow.value.filter(id => !BANNED_IDS.includes(id));
          localStorage.setItem('coffeeshop_product_order', JSON.stringify(productOrder));
        }
      } catch (e) {}

      if (!productOrder) {
        try {
          productOrder = JSON.parse(localStorage.getItem('coffeeshop_product_order') || 'null');
        } catch (e) {}
      }

      if (!productOrder && typeof window !== 'undefined' && Array.isArray(window.products) && window.products.length > 0) {
        productOrder = window.products.map(p => p.id);
      }

      // 3. Sort products by custom order
      if (productOrder && Array.isArray(productOrder) && productOrder.length > 0) {
        const orderMap = {};
        productOrder.forEach((id, idx) => { orderMap[id] = idx; });
        formatted.sort((a, b) => {
          const aIdx = orderMap[a.id] !== undefined ? orderMap[a.id] : 999999;
          const bIdx = orderMap[b.id] !== undefined ? orderMap[b.id] : 999999;
          return aIdx - bIdx;
        });
      }

      localStorage.setItem('coffeeshop_products', JSON.stringify(formatted));
      console.log('☁️ Loaded ' + formatted.length + ' products in custom order from Supabase Cloud');
      return formatted;
    }
  } catch (err) {
    console.error('fetchProductsFromCloud error:', err);
  }
  return null;
}

// 7.2 DELETE PRODUCT FROM CLOUD
async function deleteProductFromCloud(productId) {
  if (!dbClient || !isCloudConnected || !productId) return;
  try {
    await dbClient.from('products').delete().eq('id', String(productId));
    // Also remove from shop_settings.product_order
    try {
      const { data: orderRow } = await dbClient
        .from('shop_settings')
        .select('value')
        .eq('key', 'product_order')
        .maybeSingle();
      if (orderRow && Array.isArray(orderRow.value)) {
        const newOrder = orderRow.value.filter(id => id !== String(productId));
        await dbClient.from('shop_settings').upsert({
          key: 'product_order',
          value: newOrder
        });
      }
    } catch (err2) {}
    console.log('☁️ Product deleted from Supabase:', productId);
  } catch (e) {
    console.warn('Delete product error:', e);
  }
}

// 7.3 SYNC & FETCH CATEGORIES TO/FROM CLOUD
async function syncCategoriesToCloud(cats) {
  if (!dbClient || !isCloudConnected || !Array.isArray(cats)) return;
  try {
    // Purge unwanted categories from DB
    await dbClient.from('categories').delete().in('name', ['กาแฟ', 'ชา', 'เบเกอรี่']);

    // Filter out forbidden legacy categories
    const cleanCats = cats.filter(c => c !== 'กาแฟ' && c !== 'ชา' && c !== 'เบเกอรี่');

    const rows = cleanCats.map((catName, idx) => ({
      id: 'cat-' + idx,
      name: catName,
      display_order: idx
    }));
    await dbClient.from('categories').upsert(rows);
    console.log('☁️ Categories synced to Supabase');
  } catch (e) {
    console.warn('Sync categories error:', e);
  }
}

async function fetchCategoriesFromCloud() {
  if (!dbClient || !isCloudConnected) return null;
  try {
    const { data, error } = await dbClient
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.warn('Could not fetch categories from Supabase:', error.message);
      return null;
    }

    if (Array.isArray(data) && data.length > 0) {
      const catNames = data
        .map(r => r.name)
        .filter(c => c && c !== 'กาแฟ' && c !== 'ชา' && c !== 'เบเกอรี่');
      localStorage.setItem('coffeeshop_categories', JSON.stringify(catNames));
      return catNames;
    }
  } catch (err) {
    console.error('fetchCategoriesFromCloud error:', err);
  }
  return null;
}

// 8. SYNC SETTINGS TO CLOUD
async function syncSettingsToCloud(st) {
  if (!dbClient || !isCloudConnected || !st) return;
  try {
    await dbClient.from('shop_settings').upsert({
      key: 'general',
      value: st
    });
    console.log('☁️ Settings synced to Supabase');
  } catch (e) {
    console.warn('Sync settings error:', e);
  }
}

// 9. CLOUD STATUS LISTENER & UI INDICATOR
function onCloudStatusChange(callback) {
  if (typeof callback === 'function') {
    cloudSyncListeners.push(callback);
    callback(isCloudConnected);
  }
}

function notifyCloudStatus(status) {
  isCloudConnected = status;
  const badge = document.getElementById('cloudSyncBadge');
  const dot = document.getElementById('cloudSyncDot');
  const txt = document.getElementById('cloudSyncText');

  if (badge && dot && txt) {
    if (status) {
      badge.className = "px-2 sm:px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer";
      badge.title = "Supabase Cloud: เชื่อมต่อสำเร็จ ซิงค์ข้อมูลเรียลไทม์";
      dot.className = "inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      txt.innerText = "คลาวด์ออนไลน์";
    } else {
      badge.className = "px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer";
      badge.title = "โหมดออฟไลน์: บันทึกข้อมูลในเครื่องอัตโนมัติ (จะซิงค์ขึ้น Cloud เมื่อต่อเน็ต)";
      dot.className = "inline-block w-2 h-2 rounded-full bg-amber-500";
      txt.innerText = "ออฟไลน์ (เซฟในเครื่อง)";
    }
  }

  cloudSyncListeners.forEach(cb => {
    try { cb(status); } catch (e) {}
  });
}

// ตรวจสอบสถานะเน็ตออนไลน์/ออฟไลน์ของบราวเซอร์
window.addEventListener('online', () => {
  console.log('🌐 Browser went online. Re-checking Supabase & syncing pending orders...');
  initSupabase();
  setTimeout(syncAllPendingOrders, 2000);
});

window.addEventListener('offline', () => {
  console.warn('⚠️ Browser went offline. POS running in Local-Only mode.');
  notifyCloudStatus(false);
});

// เริ่มต้นเชื่อมต่อทันทีที่โหลดสคริปต์
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}
