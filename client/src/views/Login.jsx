import React, { useState } from "react";
import { authApi, setSession } from "../api.js";
import { useLang } from "../LangContext.jsx";
import Input from "../components/Input.jsx";

export default function Login({ onLogin }) {
	const { t } = useLang();
	const [mode, setMode] = useState("login");
	const [form, setForm] = useState({
		name: "",
		last_name: "",
		email: "admin@example.com",
		phone_number: "",
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
					? await authApi.login({
							phone_number: form.phone_number,
							email: form.email,
							password: form.password,
						})
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
						<small>{t("reactDashboard")}</small>
					</span>
				</div>
				<div className="segmented">
					<button
						type="button"
						className={mode === "login" ? "selected" : ""}
						onClick={() => setMode("login")}
					>
						{t("login")}
					</button>
					<button
						type="button"
						className={mode === "register" ? "selected" : ""}
						onClick={() => setMode("register")}
					>
						{t("register")}
					</button>
				</div>
				{mode === "register" && (
					<Input
						label={t("name")}
						value={form.name}
						onChange={(value) => setForm({ ...form, name: value })}
					/>
				)}
				{mode === "register" && (
					<Input
						label={t("lastName")}
						value={form.last_name}
						onChange={(value) => setForm({ ...form, last_name: value })}
					/>
				)}
				<Input
					label={
						t("phoneNumber") !== "phoneNumber"
							? t("phoneNumber")
							: "Phone Number"
					}
					value={form.phone_number}
					onChange={(value) => setForm({ ...form, phone_number: value })}
				/>
				{mode === "register" && (
					<Input
						label={t("email")}
						type="email"
						value={form.email}
						onChange={(value) => setForm({ ...form, email: value })}
					/>
				)}
				<Input
					label={t("password")}
					type="password"
					value={form.password}
					onChange={(value) => setForm({ ...form, password: value })}
				/>
				{mode === "register" && (
					<label>
						<span>{t("roleId")}</span>
						<select
							value={form.role}
							onChange={(event) =>
								setForm({ ...form, role: event.target.value })
							}
						>
							<option value="client">{t("client")}</option>
							<option value="teknik">{t("teknik")}</option>
							<option value="shites">{t("shites")}</option>
							<option value="menaxher">{t("menaxher")}</option>
						</select>
					</label>
				)}
				{error && <p className="error">{error}</p>}
				<button className="primary">
					{mode === "login" ? t("login") : t("register")}
				</button>
			</form>
		</div>
	);
}
