import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Globe from "lucide-react/dist/esm/icons/globe.js";
import LogOut from "lucide-react/dist/esm/icons/log-out.js";
import Menu from "lucide-react/dist/esm/icons/menu.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import { clearSession, getStoredUser } from "./api.js";
import { modules } from "./config.js";
import { LangProvider, useLang } from "./LangContext.jsx";
import "./styles.css";
import Login from "./views/Login.jsx";
import Profile from "./views/Profile.jsx";
import ResourcePage from "./views/ResourcePage.jsx";
import SendNotificationModal from "./views/SendNotificationModal.jsx";

function App() {
	const { t, lang, toggle } = useLang();
	const [user, setUser] = useState(getStoredUser());
	const availableModules = useMemo(
		() =>
			modules.filter(
				(item) =>
					user && (user.role === "admin" || item.roles.includes(user.role)),
			),
		[user],
	);
	const [active, setActive] = useState("sales");
	const [sidebarOpen, setSidebarOpen] = useState(true);

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

	function navigate(key) {
		setActive(key);
		if (window.innerWidth < 860) setSidebarOpen(false);
	}

	return (
		<div className={`app${sidebarOpen ? " sidebar-open" : ""}`}>
			{sidebarOpen && (
				<div
					className="sidebarBackdrop"
					onClick={() => setSidebarOpen(false)}
				/>
			)}
			<aside className={`sidebar${sidebarOpen ? "" : " sidebar--closed"}`}>
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
								onClick={() => navigate(item.key)}
								title={t(item.key)}
							>
								<Icon size={18} />
								<span>{t(item.key)}</span>
							</button>
						);
					})}
					<button
						onClick={() => navigate("profile")}
						className={active === "profile" ? "active" : ""}
					>
						<Settings size={18} />
						<span>{t("profile")}</span>
					</button>
				</nav>
				<div className="sidebarFooter">
					<button
						className="langToggle"
						onClick={toggle}
						title={t("switchLanguage")}
					>
						<Globe size={16} />
						<span>{lang.toUpperCase()}</span>
					</button>
					<button
						className="logout"
						onClick={() => {
							clearSession();
							setUser(null);
						}}
					>
						<LogOut size={18} />
						<span>{t("logout")}</span>
					</button>
				</div>
			</aside>
			<main>
				<header className="topbar">
					<div className="topbar-left">
						<button
							className="menuToggle"
							onClick={() => setSidebarOpen((o) => !o)}
							title={t("toggleMenu")}
						>
							<Menu size={20} />
						</button>
						<div>
							<p>{t("dashboard")}</p>
							<h1>
								{active === "profile"
									? t("profile")
									: t(modules.find((item) => item.key === active)?.key ?? "")}
							</h1>
						</div>
					</div>
					<ActiveIcon size={28} />
				</header>
				{active === "profile" ? (
					<Profile user={user} onUser={setUser} />
				) : active === "notifications" ? (
					<SendNotificationModal
						onClose={() => setActive(availableModules[0]?.key ?? "sales")}
					/>
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

createRoot(document.getElementById("root")).render(
	<LangProvider>
		<App />
	</LangProvider>,
);
