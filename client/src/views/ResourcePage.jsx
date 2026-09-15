import React, { useEffect, useState } from "react";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import Camera from "lucide-react/dist/esm/icons/camera.js";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import { resourceApi } from "../api.js";
import { formFields, assetUrl } from "../config.js";
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
	const [page, setPage] = useState(1);
	const [perPage, setPerPage] = useState(15);
	const [editing, setEditing] = useState(null);
	const [viewingProduct, setViewingProduct] = useState(null);
	const [viewingPhotos, setViewingPhotos] = useState(null);
	const [managingCategories, setManagingCategories] = useState(false);
	const [error, setError] = useState("");

	async function load(targetPage = page, targetPerPage = perPage) {
		setError("");
		try {
			const [list, lookupData] = await Promise.all([
				resourceApi.list(module.key, { search, page: targetPage, per_page: targetPerPage }),
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
		setPage(1);
		load(1, perPage);
	}, [module.key]);

	useEffect(() => {
		load(page, perPage);
	}, [page, perPage]);

	function handleSearchSubmit() {
		setPage(1);
		load(1, perPage);
	}

	function rowResource(row) {
		if (module.key === "sales" && row?.row_origin === "orders") return "orders";
		return module.key;
	}

	async function remove(row) {
		await resourceApi.remove(rowResource(row), row.id);
		load(page, perPage);
	}

	const total = meta.total ?? rows.length;
	const totalPages = Math.max(1, Math.ceil(total / perPage));

	function changePage(newPage) {
		if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
			setPage(newPage);
		}
	}

	return (
		<section className="workspace">
			<div className="toolbar">
				<div className="search">
					<Search size={18} />
					<input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						onKeyDown={(event) => event.key === "Enter" && handleSearchSubmit()}
						placeholder={t("search")}
					/>
				</div>
				<button onClick={handleSearchSubmit}>{t("filter")}</button>
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
								<th key={column} className={`col-${column}`}>
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
									<td key={column} className={`col-${column}`}>
										{column === "photos" ? (
											Array.isArray(row.photos) && row.photos.length > 0 ? (
												<div className="tablePhotosList" style={{ display: "flex", gap: "4px" }}>
													{row.photos.slice(0, 3).map((photo, idx) => (
														<img
															key={idx}
															src={assetUrl(photo)}
															alt="Preview"
															style={{ width: "28px", height: "28px", borderRadius: "4px", objectFit: "cover", cursor: "pointer" }}
															onClick={() => setViewingPhotos(row)}
														/>
													))}
													{row.photos.length > 3 && (
														<span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>
															+{row.photos.length - 3}
														</span>
													)}
												</div>
											) : (
												<span className="muted">—</span>
											)
										) : column === "warranty_doc_url" ? (
											row.warranty_doc_url ? (
												<a
													href={assetUrl(row.warranty_doc_url)}
													target="_blank"
													rel="noreferrer"
													style={{
														display: "inline-flex",
														alignItems: "center",
														gap: "4px",
														padding: "4px 8px",
														borderRadius: "6px",
														background: "#eff6ff",
														color: "#2563eb",
														fontWeight: "600",
														fontSize: "12px",
														textDecoration: "none",
													}}
												>
													<span>📄</span>
													<span>Dokumenti</span>
												</a>
											) : (
												<span className="muted">—</span>
											)
										) : column === "severity" ? (
											<span className={`badge severity-${row.severity ?? "medium"}`}>
												{row.severity === "high" ? "High" : row.severity === "low" ? "Low" : "Medium"}
											</span>
										) : column === "code" ? (
											<strong className="codeBadge">{row.code}</strong>
										) : (
											formatValue(row[column])
										)}
									</td>
								))}
								{formFields[module.key] && (
									<td className="actions">
										{module.key === "products" && (
											<button onClick={() => setViewingProduct(row)}>
												{t("view")}
											</button>
										)}
										{Array.isArray(row.photos) && row.photos.length > 0 && (
											<button
												type="button"
												onClick={() => setViewingPhotos(row)}
												style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
											>
												<Camera size={15} />
												{t("progressPhotos")} ({row.photos.length})
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

			<div className="paginationBar">
				<div className="paginationInfo">
					<span>
						{t("showingResults", {
							count: rows.length,
							total: total,
						})}
					</span>
					{total > 0 && (
						<span className="paginationRange">
							({(page - 1) * perPage + 1} – {Math.min(page * perPage, total)})
						</span>
					)}
				</div>

				<div className="paginationControls">
					<button
						type="button"
						className="pageBtnNav"
						disabled={page <= 1}
						onClick={() => changePage(page - 1)}
						title={t("previous") ?? "Previous"}
					>
						<ChevronLeft size={16} />
					</button>

					{getPageNumbers(page, totalPages).map((p, idx) =>
						p === "..." ? (
							<span key={`ellipsis-${idx}`} className="pageEllipsis">…</span>
						) : (
							<button
								key={`page-${p}`}
								type="button"
								className={`pageBtn ${page === p ? "active" : ""}`}
								onClick={() => changePage(p)}
							>
								{p}
							</button>
						)
					)}

					<button
						type="button"
						className="pageBtnNav"
						disabled={page >= totalPages}
						onClick={() => changePage(page + 1)}
						title={t("next") ?? "Next"}
					>
						<ChevronRight size={16} />
					</button>
				</div>

				<div className="paginationPerPage">
					<span>{t("perPage") ?? "Per page"}:</span>
					<select
						value={perPage}
						onChange={(e) => {
							const val = Number(e.target.value);
							setPerPage(val);
							setPage(1);
						}}
					>
						<option value={15}>15</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
				</div>
			</div>

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
			{viewingPhotos && (
				<PhotoGalleryModal
					row={viewingPhotos}
					onClose={() => setViewingPhotos(null)}
				/>
			)}
		</section>
	);
}

function PhotoGalleryModal({ row, onClose }) {
	const { t } = useLang();
	const photos = Array.isArray(row.photos) ? row.photos : [];
	const [activePhoto, setActivePhoto] = useState(photos[0] ?? null);

	return (
		<div className="modalBackdrop">
			<div className="modal photoGalleryModal">
				<header>
					<h2>
						{t("progressPhotos")} — {row.client_name ?? row.title ?? `Task #${row.id}`}
					</h2>
					<button type="button" onClick={onClose}>
						{t("close")}
					</button>
				</header>
				<div className="photoGalleryBody">
					{activePhoto && (
						<div className="activePhotoWrapper">
							<img src={assetUrl(activePhoto)} alt="Active Progress" className="activePhoto" />
						</div>
					)}
					<div className="photosList">
						{photos.map((photo, index) => (
							<button
								key={index}
								type="button"
								className={`photoThumbBtn ${activePhoto === photo ? "active" : ""}`}
								onClick={() => setActivePhoto(photo)}
							>
								<img src={assetUrl(photo)} alt={`Thumb ${index}`} />
							</button>
						))}
					</div>
				</div>
				<footer>
					<button type="button" onClick={onClose}>
						{t("close")}
					</button>
				</footer>
			</div>
		</div>
	);
}

function getPageNumbers(current, total) {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	if (current <= 4) {
		return [1, 2, 3, 4, 5, "...", total];
	}
	if (current >= total - 3) {
		return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
	}
	return [1, "...", current - 1, current, current + 1, "...", total];
}
