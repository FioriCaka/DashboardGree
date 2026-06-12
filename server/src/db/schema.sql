create extension if not exists pgcrypto;

create table if not exists roles (
  id bigserial primary key,
  name varchar(50) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id bigserial primary key,
  name varchar(255) not null,
  last_name varchar(255),
  email varchar(255) unique,
  phone_number varchar(50),
  address text,
  city varchar(120),
  experience text,
  role_id bigint references roles(id) on delete restrict,
  created_by bigint references users(id) on delete set null,
  password varchar(255) not null,
  email_verified_at timestamptz,
  remember_token varchar(100),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client (
  id bigserial primary key,
  name varchar(190) not null,
  last_name varchar(190) not null,
  email varchar(190) unique,
  phone_number varchar(50),
  address text,
  nipt varchar(20),
  password varchar(255),
  role_id bigint references roles(id) on delete restrict,
  created_by bigint references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id bigserial primary key,
  name varchar(190) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id bigserial primary key,
  name varchar(190) not null,
  description text,
  sku varchar(190) not null unique,
  category_id bigint references categories(id) on delete set null,
  price numeric(10,2) not null default 0,
  old_price numeric(10,2),
  image varchar(500),
  stock integer not null default 0,
  in_store integer not null default 0,
  in_hand integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists statuses (
  id bigserial primary key,
  slug varchar(40) not null unique,
  label varchar(100) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists priorities (
  id bigserial primary key,
  slug varchar(40) not null unique,
  label varchar(100) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  client_id bigint not null references client(id) on delete cascade,
  quantity integer not null default 1,
  warranty integer not null default 0,
  installation boolean not null default false,
  mounting_price numeric(10,2) not null default 0,
  total_price numeric(10,2) not null,
  payment_method varchar(40) not null default 'cash',
  status_id bigint not null references statuses(id) on delete restrict,
  sold_by bigint not null references users(id) on delete cascade,
  address text,
  sold_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists technician_jobs (
  id bigserial primary key,
  title varchar(190) not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id bigserial primary key,
  title varchar(190) not null,
  description text,
  sale_id bigint unique references sales(id) on delete set null,
  technician_job_id bigint references technician_jobs(id) on delete set null,
  due_date date,
  status_id bigint not null references statuses(id) on delete restrict,
  priority_id bigint references priorities(id) on delete set null,
  created_by bigint references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_technician (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  technician_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, technician_id)
);

create table if not exists comments (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  user_id bigint references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  created_by bigint references users(id) on delete set null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inspections (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  technician_id bigint references users(id) on delete set null,
  scheduled_at date not null,
  status varchar(40) not null default 'scheduled',
  notes text,
  photos jsonb,
  videos jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists news (
  id bigserial primary key,
  title varchar(190) not null,
  content text not null,
  type varchar(20) not null default 'blog',
  image varchar(500),
  published_at timestamptz,
  created_by bigint references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tickets (
  id bigserial primary key,
  title varchar(190) not null,
  description text not null,
  product_id bigint references products(id) on delete set null,
  client_id bigint references client(id) on delete set null,
  status varchar(40) not null default 'new',
  opened_by bigint references users(id) on delete set null,
  assigned_to bigint references users(id) on delete set null,
  photos jsonb,
  videos jsonb,
  resolved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists complaints (
  id bigserial primary key,
  title varchar(190) not null,
  description text,
  client_name varchar(190),
  client_phone varchar(50),
  client_email varchar(190),
  location varchar(255),
  client_id bigint references client(id) on delete set null,
  status_id bigint references statuses(id) on delete set null,
  priority_id bigint references priorities(id) on delete set null,
  creator_id bigint references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists products add column if not exists old_price numeric(10,2);
alter table if exists products add column if not exists image varchar(500);
alter table if exists tickets add column if not exists client_id bigint references client(id) on delete set null;
alter table if exists tickets alter column opened_by drop not null;
alter table if exists complaints add column if not exists client_id bigint references client(id) on delete set null;

create index if not exists idx_sales_status on sales(status_id);
create index if not exists idx_tasks_status on tasks(status_id);
create index if not exists idx_complaints_status_created on complaints(status_id, created_at);
create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_client on tickets(client_id);
create index if not exists idx_complaints_client on complaints(client_id);

-- ─── SHOP EXTENSIONS ──────────────────────────────────────────────────────────

alter table products add column if not exists btu integer;
alter table products add column if not exists area_m2 integer;
alter table products add column if not exists energy_class varchar(10);
alter table products add column if not exists seer varchar(20);
alter table products add column if not exists scop varchar(20);
alter table products add column if not exists wifi_enabled boolean not null default false;
alter table products add column if not exists heating_cooling boolean not null default true;
alter table products add column if not exists series varchar(100);
alter table products add column if not exists warranty_years integer not null default 3;
alter table products add column if not exists installation_price numeric(10,2) not null default 0;
alter table products add column if not exists maintenance_price numeric(10,2) not null default 0;
alter table products add column if not exists manual_url varchar(500);

create table if not exists cart_items (
  id bigserial primary key,
  client_id bigint not null references client(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  quantity integer not null default 1,
  include_installation boolean not null default false,
  include_maintenance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, product_id)
);

create table if not exists orders (
  id bigserial primary key,
  client_id bigint references client(id) on delete set null,
  order_number varchar(50) not null unique,
  delivery_name varchar(255) not null,
  delivery_phone varchar(50) not null,
  delivery_address text not null,
  delivery_city varchar(120),
  payment_method varchar(40) not null default 'cash',
  notes text,
  subtotal numeric(10,2) not null default 0,
  installation_total numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status varchar(40) not null default 'pending',
  preferred_installation_date date,
  confirmed_at timestamptz,
  installed_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  product_name varchar(255) not null,
  product_sku varchar(190),
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0,
  include_installation boolean not null default false,
  installation_price numeric(10,2) not null default 0,
  include_maintenance boolean not null default false,
  maintenance_price numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists warranties (
  id bigserial primary key,
  order_item_id bigint references order_items(id) on delete set null,
  sale_id bigint references sales(id) on delete set null,
  client_id bigint not null references client(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  product_name varchar(255) not null,
  serial_number varchar(100),
  qr_code varchar(255) unique,
  warranty_years integer not null default 3,
  activated_at timestamptz,
  expires_at timestamptz,
  registered_by bigint references users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cart_client on cart_items(client_id);
create index if not exists idx_orders_client on orders(client_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_warranties_client on warranties(client_id);
create index if not exists idx_warranties_qr on warranties(qr_code);

-- ─── PRODUCT CATALOG EXTENSIONS ───────────────────────────────────────────────

-- Hierarchical categories (parent → child)
alter table categories add column if not exists parent_id bigint references categories(id) on delete set null;

-- Extra product columns
alter table products add column if not exists main_image varchar(500);
alter table products add column if not exists product_code varchar(100);
alter table products add column if not exists model varchar(100);

-- Product images gallery
create table if not exists product_images (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  image_path varchar(500) not null,
  is_main boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- User groups for pricing tiers (e.g. retail, wholesale, VIP)
create table if not exists user_groups (
  id bigserial primary key,
  name varchar(100) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product price tiers (by user group and/or quantity break)
create table if not exists product_prices (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  usergroup_id bigint references user_groups(id) on delete cascade,
  lower_limit integer not null default 1,
  price numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product options (e.g. Color, Size)
create table if not exists options (
  id bigserial primary key,
  name varchar(100) not null unique,
  created_at timestamptz not null default now()
);

create table if not exists option_variants (
  id bigserial primary key,
  option_id bigint not null references options(id) on delete cascade,
  name varchar(100) not null,
  created_at timestamptz not null default now()
);

create table if not exists product_options (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  option_id bigint not null references options(id) on delete cascade,
  variant_id bigint not null references option_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(product_id, option_id, variant_id)
);

-- Product feature values / specs (e.g. "Klasa energjetike: A++")
create table if not exists features (
  id bigserial primary key,
  name varchar(100) not null unique,
  created_at timestamptz not null default now()
);

create table if not exists feature_variants (
  id bigserial primary key,
  feature_id bigint not null references features(id) on delete cascade,
  name varchar(100) not null,
  created_at timestamptz not null default now()
);

create table if not exists product_feature_values (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  feature_id bigint not null references features(id) on delete cascade,
  variant_id bigint not null references feature_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(product_id, feature_id, variant_id)
);

create index if not exists idx_product_images_product on product_images(product_id);
create index if not exists idx_product_prices_product on product_prices(product_id);
create index if not exists idx_product_options_product on product_options(product_id);
create index if not exists idx_product_feature_values_product on product_feature_values(product_id);

-- ─── EXPLICIT CATEGORY TABLES ─────────────────────────────────────────────────

create table if not exists main_categories (
  id bigserial primary key,
  name varchar(190) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subcategories (
  id bigserial primary key,
  name varchar(190) not null,
  main_category_id bigint references main_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, main_category_id)
);

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'products' and column_name = 'environments'
    and data_type = 'jsonb'
  ) then
    alter table products drop column environments;
  end if;
end $$;
alter table products add column if not exists environments text[] not null default '{}';
alter table products add column if not exists main_category_id bigint references main_categories(id) on delete set null;
alter table products add column if not exists subcategory_id bigint references subcategories(id) on delete set null;

create index if not exists idx_products_main_category on products(main_category_id);
create index if not exists idx_products_subcategory on products(subcategory_id);
create index if not exists idx_subcategories_main_category on subcategories(main_category_id);

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────

create table if not exists projects (
  id bigserial primary key,
  description text,
  environment varchar(50),
  area_sqm numeric(10,2),
  rooms integer,
  client_id bigint references client(id) on delete set null,
  status varchar(40) not null default 'pending',
  assigned_to bigint references users(id) on delete set null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_client on projects(client_id);
create index if not exists idx_projects_status on projects(status);

-- ─── INSTALLATIONS ───────────────────────────────────────────────────────────

create table if not exists installations (
  id bigserial primary key,
  order_date date,
  client_id bigint references client(id) on delete set null,
  product_id bigint references products(id) on delete set null,
  installation_address text,
  order_source varchar(40),
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total_price numeric(10,2) not null default 0,
  order_status varchar(40) not null default 'pending',
  payment_status varchar(40) not null default 'unpaid',
  priority varchar(40),
  sold_by bigint references users(id) on delete set null,
  technician_id bigint references users(id) on delete set null,
  installation_date date,
  serial_number varchar(100),
  notes text,
  warranty integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_installations_client on installations(client_id);
create index if not exists idx_installations_status on installations(order_status);

-- ─── CLIENT EXTENSIONS ───────────────────────────────────────────────────────

alter table client add column if not exists city varchar(120);
alter table client add column if not exists contact_person varchar(190);
alter table client add column if not exists client_status varchar(40) not null default 'active';
alter table client add column if not exists notes text;
alter table client add column if not exists client_type varchar(40) not null default 'individual';

-- ─── SALES EXTENSIONS ────────────────────────────────────────────────────────

alter table sales add column if not exists order_source varchar(40);
alter table sales add column if not exists unit_price numeric(10,2) not null default 0;
alter table sales add column if not exists discount numeric(10,2) not null default 0;
alter table sales add column if not exists payment_status varchar(40) not null default 'unpaid';
alter table sales add column if not exists priority_id bigint references priorities(id) on delete set null;
alter table sales add column if not exists technician_id bigint references users(id) on delete set null;
alter table sales add column if not exists installation_date date;
alter table sales add column if not exists serial_number varchar(100);
alter table sales add column if not exists notes text;
