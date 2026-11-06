-- Additive commerce upgrade. Apply only to a separate Preview/Test D1 database first.
-- Existing orders and products are preserved.

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 1 AND 100),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  phone TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
  discount_value REAL NOT NULL CHECK(discount_value > 0),
  minimum_order REAL NOT NULL DEFAULT 0 CHECK(minimum_order >= 0),
  maximum_discount REAL,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count >= 0),
  starts_at TEXT,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coupons_code_active ON coupons(code, active);

CREATE TABLE IF NOT EXISTS coupon_reservations (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  discount_amount REAL NOT NULL CHECK(discount_amount >= 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','applied','released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT -1 CHECK(stock_quantity >= -1);
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold >= 0);

ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending','paid','failed','refunded'));
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cod' CHECK(payment_method IN ('cod','razorpay'));
ALTER TABLE orders ADD COLUMN payment_gateway_order_id TEXT;
ALTER TABLE orders ADD COLUMN payment_gateway_payment_id TEXT;
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN coupon_discount REAL NOT NULL DEFAULT 0 CHECK(coupon_discount >= 0);
ALTER TABLE orders ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK(stock_reserved IN (0,1));
ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0 CHECK(stock_deducted IN (0,1));
ALTER TABLE orders ADD COLUMN rider_lat REAL;
ALTER TABLE orders ADD COLUMN rider_lng REAL;
ALTER TABLE orders ADD COLUMN rider_location_updated_at TEXT;
ALTER TABLE orders ADD COLUMN tracking_token_hash TEXT;
ALTER TABLE orders ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_dispatched' CHECK(delivery_status IN ('not_dispatched','assigned','picked_up','nearby','delivered'));
ALTER TABLE orders ADD COLUMN rider_name TEXT;

CREATE TABLE IF NOT EXISTS delivery_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_delivery_updates_order ON delivery_updates(order_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_gateway_order ON orders(payment_gateway_order_id) WHERE payment_gateway_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
