-- =========================================================================
-- TANTAWAN COFFEE & CAFÉ POS - SUPABASE DATABASE SCHEMA
-- วิธีใช้งาน: คัดลอกข้อความทั้งหมดนี้ ไปวางในแท็บ "SQL Editor" บน Supabase แล้วกด RUN
-- =========================================================================

-- 1. สร้างตารางคำสั่งซื้อและการขาย (Orders & Accounting)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    order_number TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/bangkok', NOW()),
    date_str TEXT,
    time_str TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    cash_received NUMERIC DEFAULT 0,
    change_amount NUMERIC DEFAULT 0,
    cashier_id TEXT,
    cashier_name TEXT,
    shift_id TEXT,
    notes TEXT,
    status TEXT DEFAULT 'completed'
);

-- 2. สร้างตารางสินค้าและราคา (Products)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    base_price NUMERIC NOT NULL DEFAULT 0,
    image TEXT,
    option_group_ids JSONB DEFAULT '[]'::jsonb,
    has_temp BOOLEAN DEFAULT false,
    temp_prices JSONB DEFAULT '{"hot": 0, "cold": 5, "frappe": 10}'::jsonb,
    has_sweetness BOOLEAN DEFAULT false,
    has_extras BOOLEAN DEFAULT false,
    extras JSONB DEFAULT '[]'::jsonb,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/bangkok', NOW())
);

-- 3. สร้างตารางหมวดหมู่สินค้า (Categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_order INT DEFAULT 0
);

-- 4. สร้างตารางประวัติกะการขายและเงินทอน (Shifts)
CREATE TABLE IF NOT EXISTS public.shifts (
    id TEXT PRIMARY KEY,
    opened_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/bangkok', NOW()),
    closed_at TIMESTAMPTZ,
    opened_by_id TEXT,
    opened_by_name TEXT,
    closed_by_id TEXT,
    closed_by_name TEXT,
    initial_cash NUMERIC DEFAULT 0,
    cash_sales NUMERIC DEFAULT 0,
    promptpay_sales NUMERIC DEFAULT 0,
    total_sales NUMERIC DEFAULT 0,
    order_count INT DEFAULT 0,
    expected_cash NUMERIC DEFAULT 0,
    actual_cash NUMERIC DEFAULT 0,
    difference NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open'
);

-- 5. สร้างตารางการตั้งค่าร้าน (Settings)
CREATE TABLE IF NOT EXISTS public.shop_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('asia/bangkok', NOW())
);

-- =========================================================================
-- ตั้งค่า Row Level Security (RLS) เพื่อให้ระบบ POS เข้าถึงได้ผ่าน anon key
-- =========================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

-- สร้างนโยบายการเข้าถึงแบบเปิดให้ POS ใช้งานได้ (anon public access)
DROP POLICY IF EXISTS "Allow all for orders" ON public.orders;
CREATE POLICY "Allow all for orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for products" ON public.products;
CREATE POLICY "Allow all for products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for categories" ON public.categories;
CREATE POLICY "Allow all for categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for shifts" ON public.shifts;
CREATE POLICY "Allow all for shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for shop_settings" ON public.shop_settings;
CREATE POLICY "Allow all for shop_settings" ON public.shop_settings FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- เปิดใช้งาน Supabase Realtime สำหรับตาราง orders และ products
-- =========================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;
END $$;
