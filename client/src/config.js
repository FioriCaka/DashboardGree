import Boxes from "lucide-react/dist/esm/icons/boxes.js";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
import Newspaper from "lucide-react/dist/esm/icons/newspaper.js";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js";
import Ticket from "lucide-react/dist/esm/icons/ticket.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Wrench from "lucide-react/dist/esm/icons/wrench.js";

export const ASSET_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");

export function assetUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${ASSET_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const modules = [
  {
    key: "sales",
    label: "Sales",
    icon: ShoppingCart,
    roles: ["admin", "menaxher", "shites"],
    columns: [
      "order_source", "product_name", "product_model", "product_btu", "product_type",
      "quantity", "unit_price", "discount", "total_price",
      "status_label", "payment_status", "priority_label",
      "seller_name", "technician_name", "installation_date",
      "serial_number", "notes", "warranty",
    ],
  },
  {
    key: "installations",
    label: "Installs",
    icon: ClipboardList,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: [
      "id", "order_date", "client_name", "client_phone", "client_city",
      "installation_address", "order_source",
      "product_name", "product_btu", "product_type",
      "quantity", "unit_price", "discount", "total_price",
      "order_status", "payment_status", "priority",
      "seller_name", "technician_name", "installation_date",
      "serial_number", "notes", "warranty",
    ],
  },
  {
    key: "tasks",
    label: "Service",
    icon: Wrench,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "title", "due_date", "status_label", "priority_label"],
  },
  {
    key: "products",
    label: "Products",
    icon: Boxes,
    roles: ["admin", "menaxher", "shites"],
    columns: ["id", "name", "sku", "main_category_name", "price", "stock"],
  },
  {
    key: "clients",
    label: "Clients",
    icon: Users,
    roles: ["admin", "menaxher", "shites"],
    columns: ["id", "name", "last_name", "email", "phone_number", "city", "address", "contact_person", "client_type", "client_status", "notes"],
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
    key: "projects",
    label: "Projects",
    icon: Wrench,
    roles: ["admin", "menaxher", "teknik", "shites"],
    columns: ["id", "client_name", "client_last_name", "environment", "area_sqm", "rooms", "status", "assigned_to_name", "created_at"],
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

export const formFields = {
  installations: [
    "orderDate", "clientId", "productId",
    "installationAddress", "orderSource",
    "quantity", "unitPrice", "discount", "totalPrice",
    "orderStatus", "paymentStatus", "priority",
    "soldBy", "technicianId", "installationDate",
    "serialNumber", "notes", "warranty",
  ],
  products: [
    "name", "sku", "model", "description", "mainCategoryId", "subcategoryId",
    "price", "oldPrice", "stock", "inStore", "inHand", "btu", "energyClass",
    "seer", "scop", "wifiEnabled", "heatingCooling", "series", "warrantyYears",
    "installationPrice", "maintenancePrice", "productCode", "environments",
  ],
  clients: ["name", "lastName", "email", "phoneNumber", "city", "address", "contactPerson", "clientType", "clientStatus", "notes", "nipt"],
  users: ["name", "lastName", "email", "phoneNumber", "address", "city", "experience", "roleId", "password"],
  sales: [
    "orderSource", "productId", "clientId",
    "quantity", "unitPrice", "discount",
    "warranty", "installation", "mountingPrice", "totalPrice",
    "paymentMethod", "paymentStatus", "statusId", "priorityId",
    "soldBy", "technicianId", "address", "soldAt",
    "installationDate", "serialNumber", "notes",
  ],
  tasks: ["title", "description", "saleId", "technicianJobId", "dueDate", "statusId", "priorityId", "technicianIds"],
  inspections: ["taskId", "technicianId", "scheduledAt", "status", "notes"],
  tickets: ["title", "description", "productId", "status", "openedBy", "assignedTo"],
  complaints: [
    "title", "description", "clientName", "clientPhone", "clientEmail",
    "location", "statusId", "priorityId",
  ],
  projects: ["clientId", "environment", "areaSqm", "rooms", "description", "status", "assignedTo", "notes"],
  news: ["title", "content", "type", "image", "publishedAt"],
};

export const labels = {
  productId: "Product",
  clientId: "Client",
  statusId: "Status",
  priorityId: "Priority",
  soldBy: "Sold By",
  technicianId: "Tekniku",
  orderDate: "Data e Porosisë",
  installationAddress: "Adresa e Instalimit",
  orderStatus: "Status Porosie",
  contactPerson: "Kontakt Person",
  clientType: "Tipi Klientit",
  clientStatus: "Statusi",
  city: "Qyteti",
  orderSource: "Burim Porosie",
  unitPrice: "Çmimi Njësi (ALL)",
  discount: "Zbritje (ALL)",
  paymentStatus: "Status Pagese",
  priorityId: "Prioritet",
  installationDate: "Data Instalimit",
  serialNumber: "Numër Serial",
  notes: "Shënime",
  technicianJobId: "Technician Job",
  technicianId: "Technician",
  technicianIds: "Technicians",
  categoryId: "Category",
  mainCategoryId: "Main Category",
  subcategoryId: "Subcategory",
  openedBy: "Opened By",
  assignedTo: "Assign to Technician",
  wifiEnabled: "Wi-Fi / GREE+",
  heatingCooling: "Heating & Cooling",
  warrantyYears: "Warranty (years)",
  energyClass: "Energy Class",
  seer: "SEER",
  scop: "SCOP",
  btu: "BTU (capacity)",
  areaMm2: "Area m²",
  installationPrice: "Installation Price (ALL)",
  maintenancePrice: "Maintenance Price (ALL)",
  series: "Series / Line",
  mainImage: "Main Image URL",
  productCode: "Product Code (import)",
  model: "Model",
  oldPrice: "Old Price",
  inStore: "In Store",
  inHand: "In Hand",
  manualUrl: "Manual URL",
  environments: "Environments (Ambienti)",
  areaSqm: "Area (m²)",
  environment: "Environment",
};

export const staticOptions = {
  status: [
    { value: "new", label: "New" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "designing", label: "Designing" },
    { value: "offer_ready", label: "Offer Ready" },
    { value: "approved", label: "Approved" },
    { value: "installing", label: "Installing" },
    { value: "resolved", label: "Resolved" },
    { value: "scheduled", label: "Scheduled" },
    { value: "completed", label: "Completed" },
    { value: "canceled", label: "Canceled" },
  ],
  environment: [
    { value: "apartament", label: "Apartament" },
    { value: "vile", label: "Vilë" },
    { value: "zyre", label: "Zyrë" },
    { value: "hotel", label: "Hotel" },
    { value: "restorant", label: "Restorant" },
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
  paymentStatus: [
    { value: "unpaid", label: "Pa Paguar" },
    { value: "partial", label: "Pjesërisht" },
    { value: "paid", label: "Paguar" },
  ],
  orderSource: [
    { value: "dyqan", label: "Dyqan" },
    { value: "online", label: "Online" },
    { value: "telefon", label: "Telefon" },
    { value: "referim", label: "Referim" },
    { value: "tjeter", label: "Tjetër" },
  ],
  clientType: [
    { value: "individual", label: "Individual" },
    { value: "biznes", label: "Biznes" },
    { value: "partner", label: "Partner" },
    { value: "distributor", label: "Distributor" },
  ],
  clientStatus: [
    { value: "active", label: "Aktiv" },
    { value: "inactive", label: "Joaktiv" },
    { value: "lead", label: "Lead" },
    { value: "prospect", label: "Prospect" },
  ],
  orderStatus: [
    { value: "pending", label: "Në Pritje" },
    { value: "confirmed", label: "Konfirmuar" },
    { value: "in_progress", label: "Në Process" },
    { value: "installed", label: "Instaluar" },
    { value: "completed", label: "Përfunduar" },
    { value: "canceled", label: "Anuluar" },
  ],
  priority: [
    { value: "low", label: "E ulët" },
    { value: "normal", label: "Normale" },
    { value: "high", label: "E lartë" },
    { value: "urgent", label: "Urgjente" },
  ],
};
