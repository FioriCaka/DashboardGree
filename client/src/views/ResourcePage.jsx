import React, { useEffect, useState } from "react";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import { resourceApi } from "../api.js";
import { formFields } from "../config.js";
import { useLang } from "../LangContext.jsx";
import { formatLabel, formatValue } from "../utils.js";
import CategoryManagementModal from "./CategoryManagementModal.jsx";
import ProductDetailModal from "./ProductDetailModal.jsx";
import ResourceForm from "./ResourceForm.jsx";

export default function ResourcePage({ module, user }) {
	const { t } = useLang();
	const [rows, setRows] = useState([]);
	const [meta, setMeta] = useState({});
	const [lookups, setLookups] = useState({});
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState(null);
	const [viewingProduct, setViewingProduct] = useState(null);
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

	function rowResource(row) {
		if (module.key === "sales" && row?.row_origin === "orders") return "orders";
		return module.key;
	}

	async function remove(row) {
		await resourceApi.remove(rowResource(row), row.id);
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
						placeholder={t("search")}
					/>
				</div>
				<button onClick={load}>{t("filter")}</button>
				{module.key === "products" && (
					<button onClick={() => setManagingCategories(true)}>
						<Settings size={18} />
						{t("categories")}
					</button>
				)}
				{formFields[module.key] && (
					<button className="primary" onClick={() => setEditing({})}>
						<Plus size={18} />
						{t("add")}
					</button>
				)}
			</div>

			{error && <p className="error">{error}</p>}

			<div className="tableWrap">
				<table>
					<thead>
						<tr>
							{module.columns.map((column) => (
								<th key={column}>
									{t(column) !== column ? t(column) : formatLabel(column)}
								</th>
							))}
							{formFields[module.key] && <th>{t("actions")}</th>}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={`${row.row_origin ?? module.key}-${row.id}`}>
								{module.columns.map((column) => (
									<td key={column}>{formatValue(row[column])}</td>
								))}
								{formFields[module.key] && (
									<td className="actions">
										{module.key === "products" && (
											<button onClick={() => setViewingProduct(row)}>
												{t("view")}
											</button>
										)}
										<button
											onClick={() =>
												setEditing({ ...row, _resource: rowResource(row) })
											}
										>
											{t("edit")}
										</button>
										<button className="danger" onClick={() => remove(row)}>
											{t("delete")}
										</button>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p className="meta">
				{t("showingResults", {
					count: rows.length,
					total: meta.total ?? rows.length,
				})}
			</p>

			{editing && (
				<ResourceForm
					resource={editing?._resource ?? module.key}
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
			{viewingProduct && (
				<ProductDetailModal
					row={viewingProduct}
					lookups={lookups}
					onClose={() => setViewingProduct(null)}
					onEdit={() => {
						setEditing(viewingProduct);
						setViewingProduct(null);
					}}
					onDeleted={() => {
						setViewingProduct(null);
						load();
					}}
				/>
			)}
		</section>
	);
}
