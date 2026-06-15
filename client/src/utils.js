import { formFields } from "./config.js";

export function formatLabel(value) {
	return value
		.replace(/_/g, " ")
		.replace(/[A-Z]/g, (letter) => ` ${letter}`)
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatValue(value) {
	if (value === null || value === undefined || value === "") return "N/A";
	if (Array.isArray(value))
		return value.map((item) => item.name ?? item).join(", ");
	if (typeof value === "object") return JSON.stringify(value);
	if (String(value).includes("T00:00:00.000Z"))
		return new Date(value).toLocaleDateString();
	return String(value);
}

export function lookupOptions(field, lookups, form) {
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
		mainCategoryId: "main_categories",
		soldBy: "users",
	};
	if (field === "subcategoryId") {
		const all = lookups.subcategories ?? [];
		const filtered = form?.mainCategoryId
			? all.filter(
					(s) => String(s.main_category_id) === String(form.mainCategoryId),
				)
			: all;
		return filtered.map((item) => ({ value: item.id, label: item.name }));
	}
	const key = map[field];
	if (!key) return null;
	return (lookups[key] ?? []).map((item) => ({
		value: item.id,
		label: item.label ?? item.name ?? item.title ?? item.sku ?? item.email,
	}));
}

export function normalizeInitial(resource, row, user, lookups) {
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
	if (resource === "maintenance" && !initial.status)
		initial.status = "scheduled";
	if (resource === "news" && !initial.type) initial.type = "blog";
	if (resource === "projects" && !initial.status) initial.status = "pending";
	return initial;
}

export function coercePayload(resource, form) {
	const payload = { ...form };
	for (const key of Object.keys(payload)) {
		if (payload[key] === "") payload[key] = null;
	}
	if (payload.password === null) delete payload.password;
	if (resource === "tickets" && !payload.status) payload.status = "new";
	if (resource === "maintenance" && !payload.status)
		payload.status = "scheduled";
	if (resource === "news" && !payload.type) payload.type = "blog";
	if (resource === "tasks" && !Array.isArray(payload.technicianIds))
		payload.technicianIds = [];
	if (resource === "products" && !Array.isArray(payload.environments))
		payload.environments = [];
	return payload;
}
