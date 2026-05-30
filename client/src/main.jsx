import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle.js";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Boxes from "lucide-react/dist/esm/icons/boxes.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
import LogOut from "lucide-react/dist/esm/icons/log-out.js";
import Newspaper from "lucide-react/dist/esm/icons/newspaper.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js";
import Ticket from "lucide-react/dist/esm/icons/ticket.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Wrench from "lucide-react/dist/esm/icons/wrench.js";
import {
  authApi,
  clearSession,
  getStoredUser,
  resourceApi,
  setSession,
} from "./api.js";
import "./styles.css";

const modules = [
  {
    key: "sales",
    label: "Sales",
    icon: ShoppingCart,
    roles: ["admin", "menaxher", "shites"],
    columns: [
      "id",
      "product_name",
      "client_name",
      "quantity",
      "total_price",
      "status_label",
    ],
  },
  {
    key: "tasks",
    label: "Install / Service",
    icon: ClipboardList,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "title", "due_date", "status_label", "priority_label"],
  },
  {
    key: "products",
    label: "Products",
    icon: Boxes,
    roles: ["admin", "menaxher", "shites"],
    columns: ["id", "name", "sku", "category_name", "price", "stock"],
  },
  {
    key: "clients",
    label: "Clients",
    icon: Users,
    roles: ["admin", "menaxher", "shites"],
    columns: ["id", "name", "last_name", "email", "phone_number"],
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    roles: ["admin"],
    columns: ["id", "name", "email", "role", "city"],
  },
  {
    key: "inspections",
    label: "Inspections",
    icon: CheckCircle2,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "task_title", "technician_name", "scheduled_at", "status"],
  },
  {
    key: "tickets",
    label: "Service Tickets",
    icon: Ticket,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "title", "product_name", "status", "technician_name"],
  },
  {
    key: "complaints",
    label: "Complaints",
    icon: AlertCircle,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "title", "client_name", "status_label", "priority_label"],
  },
  {
    key: "news",
    label: "News & Blogs",
    icon: Newspaper,
    roles: ["admin", "menaxher"],
    columns: ["id", "title", "type", "published_at", "creator_name"],
  },
  {
    key: "reports",
    label: "Reports",
    icon: FileText,
    roles: ["admin", "menaxher", "teknik"],
    columns: ["id", "task_title", "status_label", "completed_at"],
  },
];

const formFields = {
  products: [
    "name",
    "sku",
    "description",
    "categoryId",
    "price",
    "stock",
    "inStore",
    "inHand",
  ],
  clients: ["name", "lastName", "email", "phoneNumber", "address", "nipt"],
  users: [
    "name",
    "lastName",
    "email",
    "phoneNumber",
    "address",
    "city",
    "experience",
    "roleId",
    "password",
  ],
  sales: [
    "productId",
    "clientId",
    "quantity",
    "warranty",
    "installation",
    "mountingPrice",
    "totalPrice",
    "paymentMethod",
    "statusId",
    "soldBy",
    "address",
    "soldAt",
  ],
  tasks: [
    "title",
    "description",
    "saleId",
    "technicianJobId",
    "dueDate",
    "statusId",
    "priorityId",
    "technicianIds",
  ],
  inspections: ["taskId", "technicianId", "scheduledAt", "status", "notes"],
  tickets: [
    "title",
    "description",
    "productId",
    "status",
    "openedBy",
    "assignedTo",
  ],
  complaints: [
    "title",
    "description",
    "clientName",
    "clientPhone",
    "clientEmail",
    "location",
    "statusId",
    "priorityId",
  ],
  news: ["title", "content", "type", "image", "publishedAt"],
};

const labels = {
  productId: "Product",
  clientId: "Client",
  statusId: "Status",
  priorityId: "Priority",
  soldBy: "Sold By",
  technicianJobId: "Technician Job",
  technicianId: "Technician",
  technicianIds: "Technicians",
  categoryId: "Category",
  openedBy: "Opened By",
  assignedTo: "Assign to Technician",
};

const staticOptions = {
  status: [
    { value: "new", label: "New" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
    { value: "canceled", label: "Canceled" },
  ],
  type: [
    { value: "blog", label: "Blog" },
    { value: "discount", label: "Discount" },
  ],
  paymentMethod: [
    { value: "cash", label: "Cash" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
  ],
};

function App() {
  const [user, setUser] = useState(getStoredUser());
  const availableModules = useMemo(
    () => modules.filter((item) => user && item.roles.includes(user.role)),
    [user],
  );
  const [active, setActive] = useState("sales");

  useEffect(() => {
    if (active === "profile") return;
    if (
      availableModules.length &&
      !availableModules.some((item) => item.key === active)
    ) {
      setActive(availableModules[0].key);
    }
  }, [availableModules, active]);

  if (!user) return <Login onLogin={setUser} />;

  const ActiveIcon =
    availableModules.find((item) => item.key === active)?.icon ?? BarChart3;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">G</span>
          <span>
            <strong>Gree</strong>
            <small>{user.role}</small>
          </span>
        </div>
        <nav>
          {availableModules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={active === item.key ? "active" : ""}
                onClick={() => setActive(item.key)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setActive("profile")}
            className={active === "profile" ? "active" : ""}
          >
            <Settings size={18} />
            <span>Profile</span>
          </button>
        </nav>
        <button
          className="logout"
          onClick={() => {
            clearSession();
            setUser(null);
          }}
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <p>Dashboard</p>
            <h1>
              {active === "profile"
                ? "Profile"
                : modules.find((item) => item.key === active)?.label}
            </h1>
          </div>
          <ActiveIcon size={28} />
        </header>
        {active === "profile" ? (
          <Profile user={user} onUser={setUser} />
        ) : (
          <ResourcePage
            module={modules.find((item) => item.key === active)}
            user={user}
          />
        )}
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    last_name: "",
    email: "admin@example.com",
    password: "asdasdasd",
    role: "client",
  });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const response =
        mode === "login"
          ? await authApi.login(form)
          : await authApi.register(form);
      setSession(response);
      onLogin(response.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="authScreen">
      <form className="authPanel" onSubmit={submit}>
        <div className="brand large">
          <span className="brandMark">G</span>
          <span>
            <strong>Gree</strong>
            <small>React dashboard</small>
          </span>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={mode === "login" ? "selected" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "selected" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
        {mode === "register" && (
          <Input
            label="Name"
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
          />
        )}
        {mode === "register" && (
          <Input
            label="Last Name"
            value={form.last_name}
            onChange={(value) => setForm({ ...form, last_name: value })}
          />
        )}
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) => setForm({ ...form, email: value })}
        />
        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={(value) => setForm({ ...form, password: value })}
        />
        {mode === "register" && (
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            >
              <option value="client">Client</option>
              <option value="teknik">Technician</option>
              <option value="shites">Seller</option>
              <option value="menaxher">Manager</option>
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary">
          {mode === "login" ? "Login" : "Register"}
        </button>
      </form>
    </div>
  );
}

function ResourcePage({ module, user }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [lookups, setLookups] = useState({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [list, lookupData] = await Promise.all([
        resourceApi.list(module.key, { search, per_page: 20 }),
        module.key === "reports" ? Promise.resolve({}) : resourceApi.lookups(),
      ]);
      setRows(list.data ?? []);
      setMeta(list.meta ?? {});
      setLookups(lookupData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [module.key]);

  async function remove(id) {
    await resourceApi.remove(module.key, id);
    load();
  }

  return (
    <section className="workspace">
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && load()}
            placeholder="Search"
          />
        </div>
        <button onClick={load}>Filter</button>
        {module.key === "products" && (
          <button onClick={() => setManagingCategories(true)}>
            <Settings size={18} />
            Categories
          </button>
        )}
        {formFields[module.key] && (
          <button className="primary" onClick={() => setEditing({})}>
            <Plus size={18} />
            Add
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {module.columns.map((column) => (
                <th key={column}>{formatLabel(column)}</th>
              ))}
              {formFields[module.key] && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {module.columns.map((column) => (
                  <td key={column}>{formatValue(row[column])}</td>
                ))}
                {formFields[module.key] && (
                  <td className="actions">
                    <button onClick={() => setEditing(row)}>Edit</button>
                    <button className="danger" onClick={() => remove(row.id)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">
        Showing {rows.length} of {meta.total ?? rows.length} results
      </p>
      {editing && (
        <ResourceForm
          resource={module.key}
          row={editing}
          user={user}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {managingCategories && (
        <CategoryManagementModal
          onClose={() => setManagingCategories(false)}
          onChanged={load}
        />
      )}
    </section>
  );
}

function CategoryManagementModal({ onClose, onChanged }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ id: null, name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCategories() {
    setError("");
    try {
      const result = await resourceApi.list("categories", { per_page: 100 });
      setCategories(result.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setError("");
    try {
      if (form.id)
        await resourceApi.update("categories", form.id, { name: form.name });
      else await resourceApi.create("categories", { name: form.name });
      setForm({ id: null, name: "" });
      await loadCategories();
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeCategory(id) {
    setError("");
    try {
      await resourceApi.remove("categories", id);
      await loadCategories();
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modalBackdrop">
      <form className="modal categoryModal" onSubmit={submit}>
        <header>
          <h2>Product Categories</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="categoryManager">
          <label>
            <span>Category name</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="e.g. Split"
            />
          </label>
          <button className="primary">
            {form.id ? "Update category" : "Add category"}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm({ id: null, name: "" })}
            >
              Cancel edit
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="categoryList">
          {loading ? (
            <p className="meta">Loading categories...</p>
          ) : (
            categories.map((category) => (
              <div className="categoryRow" key={category.id}>
                <strong>{category.name}</strong>
                <span>#{category.id}</span>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ id: category.id, name: category.name })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeCategory(category.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </form>
    </div>
  );
}

function ResourceForm({ resource, row, lookups, user, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    normalizeInitial(resource, row, user, lookups),
  );
  const [error, setError] = useState("");
  const fields = formFields[resource] ?? [];

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = coercePayload(resource, form);
      if (row.id) await resourceApi.update(resource, row.id, payload);
      else await resourceApi.create(resource, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={submit}>
        <header>
          <h2>
            {row.id ? "Edit" : "Create"} {resource}
          </h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="formGrid">
          {fields.map((field) => (
            <Field
              key={field}
              field={field}
              value={form[field]}
              lookups={lookups}
              onChange={(value) => setForm({ ...form, [field]: value })}
            />
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save</button>
        </footer>
      </form>
    </div>
  );
}

function Field({ field, value, lookups, onChange }) {
  const label = labels[field] ?? formatLabel(field);
  const options = lookupOptions(field, lookups);
  if (
    field === "description" ||
    field === "content" ||
    field === "notes" ||
    field === "experience"
  ) {
    return (
      <label>
        <span>{label}</span>
        <textarea
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }
  if (field === "installation") {
    return (
      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  if (field === "technicianIds") {
    return (
      <label>
        <span>{label}</span>
        <select
          multiple
          value={value ?? []}
          onChange={(event) =>
            onChange(
              [...event.target.selectedOptions].map((option) => option.value),
            )
          }
        >
          {(lookups.technicians ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (options || staticOptions[field]) {
    const choices = options ?? staticOptions[field];
    return (
      <label>
        <span>{label}</span>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select</option>
          {choices.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const type =
    field.toLowerCase().includes("date") || field.endsWith("At")
      ? "date"
      : field.toLowerCase().includes("price") ||
          ["quantity", "stock", "warranty", "inStore", "inHand"].includes(field)
        ? "number"
        : "text";
  return (
    <Input label={label} type={type} value={value ?? ""} onChange={onChange} />
  );
}

function Profile({ user, onUser }) {
  const [form, setForm] = useState(user);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    const response = await authApi.updateProfile(form);
    localStorage.setItem("gree_user", JSON.stringify(response.user));
    onUser(response.user);
    setMessage("Saved.");
  }

  return (
    <section className="workspace narrow">
      <form className="profile" onSubmit={submit}>
        <Input
          label="Name"
          value={form.name ?? ""}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        <Input
          label="Last Name"
          value={form.last_name ?? ""}
          onChange={(value) => setForm({ ...form, last_name: value })}
        />
        <Input
          label="Email"
          value={form.email ?? ""}
          onChange={(value) => setForm({ ...form, email: value })}
        />
        <Input
          label="Phone Number"
          value={form.phone_number ?? ""}
          onChange={(value) => setForm({ ...form, phone_number: value })}
        />
        <Input
          label="Address"
          value={form.address ?? ""}
          onChange={(value) => setForm({ ...form, address: value })}
        />
        {message && <p className="success">{message}</p>}
        <button className="primary">Save</button>
      </form>
    </section>
  );
}

function Input({ label, type = "text", value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function lookupOptions(field, lookups) {
  const map = {
    roleId: "roles",
    productId: "products",
    clientId: "clients",
    statusId: "statuses",
    priorityId: "priorities",
    technicianJobId: "technician_jobs",
    technicianId: "technicians",
    assignedTo: "technicians",
    openedBy: "users",
    categoryId: "categories",
    soldBy: "users",
  };
  const key = map[field];
  if (!key) return null;
  return (lookups[key] ?? []).map((item) => ({
    value: item.id,
    label: item.label ?? item.name ?? item.title ?? item.sku ?? item.email,
  }));
}

function normalizeInitial(resource, row, user, lookups) {
  const initial = {};
  for (const field of formFields[resource] ?? []) {
    const snake = field.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`,
    );
    initial[field] = row[field] ?? row[snake] ?? "";
  }
  if (resource === "tickets" && !initial.openedBy) initial.openedBy = user.id;
  if (resource === "tickets" && !initial.status) initial.status = "new";
  if (resource === "sales" && !initial.soldBy) initial.soldBy = user.id;
  if (resource === "sales" && !initial.statusId)
    initial.statusId =
      lookups.statuses?.find((s) => s.slug === "pending")?.id ?? "";
  if (resource === "tasks" && !initial.statusId)
    initial.statusId =
      lookups.statuses?.find((s) => s.slug === "pending")?.id ?? "";
  if (resource === "tasks" && !initial.priorityId)
    initial.priorityId =
      lookups.priorities?.find((p) => p.slug === "medium")?.id ?? "";
  if (resource === "complaints" && !initial.statusId)
    initial.statusId =
      lookups.statuses?.find((s) => s.slug === "pending")?.id ?? "";
  if (resource === "complaints" && !initial.priorityId)
    initial.priorityId =
      lookups.priorities?.find((p) => p.slug === "medium")?.id ?? "";
  if (resource === "inspections" && !initial.status)
    initial.status = "scheduled";
  if (resource === "news" && !initial.type) initial.type = "blog";
  return initial;
}

function coercePayload(resource, form) {
  const payload = { ...form };
  for (const key of Object.keys(payload)) {
    if (payload[key] === "") payload[key] = null;
  }
  if (payload.password === null) delete payload.password;
  if (resource === "tickets" && !payload.status) payload.status = "new";
  if (resource === "inspections" && !payload.status)
    payload.status = "scheduled";
  if (resource === "news" && !payload.type) payload.type = "blog";
  if (resource === "tasks" && !Array.isArray(payload.technicianIds))
    payload.technicianIds = [];
  return payload;
}

function formatLabel(value) {
  return value
    .replace(/_/g, " ")
    .replace(/[A-Z]/g, (letter) => ` ${letter}`)
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (Array.isArray(value))
    return value.map((item) => item.name ?? item).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (String(value).includes("T00:00:00.000Z"))
    return new Date(value).toLocaleDateString();
  return String(value);
}

createRoot(document.getElementById("root")).render(<App />);
