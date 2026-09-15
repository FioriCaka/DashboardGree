import React, { useState } from "react";
import { resourceApi, uploadWarrantyDoc } from "../api.js";
import { formFields, labels, staticOptions, assetUrl } from "../config.js";
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
	const [uploadingWarranty, setUploadingWarranty] = useState(false);

	if (field === "warrantyDocUrl") {
		const fileName = value ? String(value).split("/").pop() : "";
		return (
			<div className="formFieldSpan2" style={{ gridColumn: "1 / -1", margin: "10px 0" }}>
				<label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
					{label}
				</label>
				{value ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "12px",
							padding: "10px 14px",
							background: "#f8fafc",
							border: "1px solid var(--line)",
							borderRadius: "8px",
						}}
					>
						<span style={{ fontSize: "24px" }}>📄</span>
						<div style={{ flex: 1, minWidth: 0 }}>
							<a
								href={assetUrl(value)}
								target="_blank"
								rel="noreferrer"
								style={{
									fontWeight: "600",
									color: "#303b95",
									textDecoration: "underline",
									wordBreak: "break-all",
									fontSize: "13px",
								}}
							>
								{fileName}
							</a>
							<span style={{ display: "block", fontSize: "11px", color: "var(--muted)" }}>
								Dokumenti i garancisë është bashkëngjitur me sukses.
							</span>
						</div>
						<button
							type="button"
							onClick={() => onChange("")}
							style={{
								background: "#fee2e2",
								color: "#b91c1c",
								border: "none",
								padding: "6px 14px",
								borderRadius: "6px",
								cursor: "pointer",
								fontWeight: "600",
								fontSize: "12px",
							}}
						>
							{t("delete") || "Hiq"}
						</button>
					</div>
				) : (
					<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
						<input
							type="file"
							accept=".pdf,image/jpeg,image/png,image/webp"
							style={{ display: "none" }}
							id="warranty-doc-file-input"
							onChange={async (e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								try {
									setUploadingWarranty(true);
									const res = await uploadWarrantyDoc(file);
									onChange(res.url);
								} catch (err) {
									alert(err.message || "Gabim gjatë ngarkimit të skedarit të garancisë");
								} finally {
									setUploadingWarranty(false);
									e.target.value = "";
								}
							}}
						/>
						<label
							htmlFor="warranty-doc-file-input"
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: "8px",
								padding: "9px 18px",
								background: "#303b95",
								color: "#fff",
								borderRadius: "8px",
								cursor: uploadingWarranty ? "wait" : "pointer",
								fontWeight: "600",
								fontSize: "13px",
								boxShadow: "0 2px 4px rgba(48,59,149,0.2)",
							}}
						>
							<span>📎</span>
							<span>
								{uploadingWarranty
									? "Duke ngarkuar skedarin..."
									: "Zgjidh Skedarin e Garancisë (PDF / Foto)"}
							</span>
						</label>
					</div>
				)}
			</div>
		);
	}

	if (
		field === "description" ||
		field === "content" ||
		field === "notes" ||
		field === "experience" ||
		field === "causes" ||
		field === "action"
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

	if (["installation", "wifiEnabled", "heatingCooling", "isVisible"].includes(field)) {
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
				{Array.isArray(row.photos) && row.photos.length > 0 && (
					<div className="formPhotosSection" style={{ marginTop: "16px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
						<span style={{ display: "block", marginBottom: "8px", color: "var(--muted)", fontSize: "13px", fontWeight: "700" }}>
							{t("progressPhotos")} ({row.photos.length})
						</span>
						<div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
							{row.photos.map((photo, index) => (
								<div key={index} style={{ position: "relative", width: "80px", height: "80px", borderRadius: "8px", border: "1px solid var(--line)", overflow: "hidden", background: "#f0f3f1" }}>
									<a href={assetUrl(photo)} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
										<img src={assetUrl(photo)} alt={`Progress ${index}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
									</a>
								</div>
							))}
						</div>
					</div>
				)}
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
