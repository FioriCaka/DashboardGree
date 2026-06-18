import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function SendNotificationModal() {
	const [mode, setMode] = useState("all"); // "all" | "selected"
	const [recipients, setRecipients] = useState([]);
	const [selected, setSelected] = useState([]);
	const [form, setForm] = useState({ title: "", body: "" });
	const [openMaintenancePage, setOpenMaintenancePage] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");

	useEffect(() => {
		api("/notifications/recipients")
			.then((data) => setRecipients(data.data ?? []))
			.catch(() => {});
	}, []);

	function toggleRecipient(id) {
		setSelected((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	}

	async function send(event) {
		event.preventDefault();
		setError("");
		setSuccess("");
		if (!form.title.trim() || !form.body.trim()) {
			setError("Title and message are required.");
			return;
		}
		if (mode === "selected" && !selected.length) {
			setError("Select at least one recipient.");
			return;
		}
		setSending(true);
		try {
			await api("/notifications/send", {
				method: "POST",
				body: JSON.stringify(
					mode === "all"
						? {
								title: form.title,
								body: form.body,
								allClients: true,
								data: openMaintenancePage
									? { screen: "mirembajtje", kind: "maintenance_questionnaire" }
									: undefined,
							}
						: {
								title: form.title,
								body: form.body,
								clientIds: selected,
								data: openMaintenancePage
									? { screen: "mirembajtje", kind: "maintenance_questionnaire" }
									: undefined,
							},
				),
			});
			setSuccess("Notification sent successfully.");
			setForm({ title: "", body: "" });
			setSelected([]);
		} catch (err) {
			setError(err.message);
		} finally {
			setSending(false);
		}
	}

	return (
		<section className="workspace">
			<form onSubmit={send}>
				<div className="toolbar">
					<h2 style={{ margin: 0 }}>Send Push Notification</h2>
				</div>

				<div className="tableWrap" style={{ padding: "16px" }}>
					<div className="formGrid">
						<label>
							<span>Title</span>
							<input
								value={form.title}
								onChange={(e) => setForm({ ...form, title: e.target.value })}
								placeholder="Notification title"
							/>
						</label>

						<label style={{ gridColumn: "1 / -1" }}>
							<span>Message</span>
							<textarea
								value={form.body}
								onChange={(e) => setForm({ ...form, body: e.target.value })}
								placeholder="Notification body"
							/>
						</label>

						<label style={{ gridColumn: "1 / -1" }}>
							<span>Recipients</span>
							<div
								style={{ display: "flex", gap: "12px", marginBottom: "8px" }}
							>
								<label
									style={{ display: "flex", alignItems: "center", gap: 6 }}
								>
									<input
										type="radio"
										checked={mode === "all"}
										onChange={() => setMode("all")}
									/>
									All clients with app installed
								</label>
								<label
									style={{ display: "flex", alignItems: "center", gap: 6 }}
								>
									<input
										type="radio"
										checked={mode === "selected"}
										onChange={() => setMode("selected")}
									/>
									Select specific clients
								</label>
							</div>

							{mode === "selected" && (
								<div
									style={{
										maxHeight: 220,
										overflowY: "auto",
										border: "1px solid var(--line)",
										borderRadius: 8,
										padding: "6px 10px",
									}}
								>
									{recipients.length === 0 && (
										<p style={{ color: "var(--muted)", fontSize: 13 }}>
											No clients with push tokens found.
										</p>
									)}
									{recipients.map((r) => (
										<label
											key={r.id}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												padding: "4px 0",
											}}
										>
											<input
												type="checkbox"
												checked={selected.includes(r.id)}
												onChange={() => toggleRecipient(r.id)}
											/>
											{r.name} {r.last_name}
											{r.phone_number ? ` · ${r.phone_number}` : ""}
										</label>
									))}
								</div>
							)}
						</label>

						<label
							style={{
								gridColumn: "1 / -1",
								display: "flex",
								alignItems: "center",
								gap: 8,
							}}
						>
							<input
								type="checkbox"
								checked={openMaintenancePage}
								onChange={(e) => setOpenMaintenancePage(e.target.checked)}
							/>
							Open mirembajtje page when tapped
						</label>
					</div>

					{error && (
						<p className="error" style={{ marginTop: 12 }}>
							{error}
						</p>
					)}
					{success && (
						<p style={{ color: "green", marginTop: 12, fontWeight: 600 }}>
							{success}
						</p>
					)}

					<div style={{ marginTop: 16 }}>
						<button className="primary" disabled={sending}>
							{sending ? "Sending…" : "Send Notification"}
						</button>
					</div>
				</div>
			</form>
		</section>
	);
}
