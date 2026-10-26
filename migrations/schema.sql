PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  price REAL NOT NULL CHECK(price >= 0),
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0, 1)),
  emoji TEXT NOT NULL DEFAULT '🍰',
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  pin TEXT NOT NULL CHECK(length(pin) = 6),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  delivery_fee REAL NOT NULL CHECK(delivery_fee >= 0),
  total REAL NOT NULL CHECK(total >= 0),
  status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_order ON products(sort_order, id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_hash, attempted_at);

INSERT OR IGNORE INTO products (id, name, price, description, category, available, emoji, image, sort_order) VALUES
  (1, 'Chocolate Celebration Cake', 650, 'Rich chocolate, perfect for sharing.', 'Cakes', 1, '🎂', '', 1),
  (2, 'Butter Croissant', 90, 'Flaky, buttery and oven-fresh.', 'Pastries', 1, '🥐', '', 2),
  (3, 'Chocolate Pastry', 100, 'Soft layers with chocolate cream.', 'Pastries', 1, '🍰', '', 3),
  (4, 'Vanilla Cupcakes', 60, 'Vanilla sponge with creamy topping.', 'Cakes', 1, '🧁', '', 4),
  (5, 'Cookies Box', 180, 'Freshly baked, crisp cookies.', 'Cookies', 1, '🍪', '', 5),
  (6, 'Fresh Bread', 50, 'Soft bread baked fresh.', 'Bread', 1, '🍞', '', 6);

INSERT OR IGNORE INTO app_settings (setting_key, value_json) VALUES (
  'app',
  '{"settings":{"deliveryFee":40,"freeDeliveryAbove":999,"address":"","phone":"","hours":"9:00 AM – 9:00 PM","serviceArea":""},"siteBranding":{"name":"🥐 KK Special Bakery","tag":"Freshly baked · Made with care","hero":"Fresh treats for every moment","text":"Premium cakes, pastries and bakery favourites.","logo":"","storePhoto":""},"accent":"#a84d2c","background":"#fffaf3"}'
);
