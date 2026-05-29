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
  status varchar(40) not null default 'new',
  opened_by bigint not null references users(id) on delete cascade,
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
  status_id bigint references statuses(id) on delete set null,
  priority_id bigint references priorities(id) on delete set null,
  creator_id bigint references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_status on sales(status_id);
create index if not exists idx_tasks_status on tasks(status_id);
create index if not exists idx_complaints_status_created on complaints(status_id, created_at);
create index if not exists idx_tickets_status on tickets(status);
