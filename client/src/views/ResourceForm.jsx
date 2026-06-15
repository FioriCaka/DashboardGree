import React, { useState } from "react";
import { resourceApi } from "../api.js";
import { formFields, labels, staticOptions } from "../config.js";
import { useLang } from "../LangContext.jsx";
import {
	coercePayload,
	formatLabel,
	lookupOptions,
	normalizeInitial,
} from "../utils.js";
import Input from "../components/Input.jsx";

function Field({ field, value, form, lookups, onChange, t }) {
	const rawLabel = labels[field] ?? formatLabel(field);
	const label = t(field) !== field ? t(field) : rawLabel;
	const options = lookupOptions(field, lookups, form);

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

	if (["installation", "wifiEnabled", "heatingCooling"].includes(field)) {
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

	if (field === "environments") {
		const envOptions = [
			{ value: "apartament", label: t("apartament") },
			{ value: "vile", label: t("vile") },
			{ value: "zyre", label: t("zyre") },
			{ value: "hotel", label: t("hotel") },
			{ value: "restorant", label: t("restorant") },
		];
		const selected = Array.isArray(value) ? value : [];
		return (
			<label>
				<span>{label}</span>
				<select
					multiple
					value={selected}
					onChange={(event) =>
						onChange([...event.target.selectedOptions].map((o) => o.value))
					}
				>
					{envOptions.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
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
		const choices = (options ?? staticOptions[field]).map((opt) => ({
			...opt,
			label: t(opt.value) !== opt.value ? t(opt.value) : opt.label,
		}));
		return (
			<label>
				<span>{label}</span>
				<select
					value={value ?? ""}
					onChange={(event) => onChange(event.target.value)}
				>
					<option value="">{t("select")}</option>
					{choices.map((item) => (
						<option key={item.value} value={item.value}>
							{item.label}
						</option>
					))}
				</select>
			</label>
		);
	}

	const type = field.toLowerCase().includes("password")
		? "password"
		: field.toLowerCase().includes("date") || field.endsWith("At")
			? "date"
			: field.toLowerCase().includes("price") ||
				  [
						"quantity",
						"stock",
						"warranty",
						"inStore",
						"inHand",
						"btu",
						"warrantyYears",
						"areaSqm",
						"rooms",
				  ].includes(field)
				? "number"
				: "text";

	return (
		<Input label={label} type={type} value={value ?? ""} onChange={onChange} />
	);
}

export default function ResourceForm({
	resource,
	row,
	lookups,
	user,
	onClose,
	onSaved,
}) {
	const { t } = useLang();
	const [form, setForm] = useState(() =>
		normalizeInitial(resource, row, user, lookups),
	);
	const [error, setError] = useState("");
	const fields = formFields[resource] ?? [];

	async function submit(event) {
		event.preventDefault();
		setError("");
		if (resource === "clients" && !String(form.phoneNumber ?? "").trim()) {
			setError("Phone number is required.");
			return;
		}
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
						{row.id ? t("editTitle") : t("createTitle")}{" "}
						{t(resource) !== resource ? t(resource) : resource}
					</h2>
					<button type="button" onClick={onClose}>
						{t("close")}
					</button>
				</header>
				<div className="formGrid">
					{fields.map((field) => (
						<Field
							key={field}
							field={field}
							value={form[field]}
							form={form}
							lookups={lookups}
							t={t}
							onChange={(value) => setForm({ ...form, [field]: value })}
						/>
					))}
				</div>
				{error && <p className="error">{error}</p>}
				<footer>
					<button type="button" onClick={onClose}>
						{t("cancel")}
					</button>
					<button className="primary">{t("save")}</button>
				</footer>
			</form>
		</div>
	);
}
