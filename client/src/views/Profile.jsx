import React, { useState } from "react";
import { authApi } from "../api.js";
import { useLang } from "../LangContext.jsx";
import Input from "../components/Input.jsx";

export default function Profile({ user, onUser }) {
  const { t } = useLang();
  const [form, setForm] = useState(user);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    const response = await authApi.updateProfile(form);
    localStorage.setItem("gree_user", JSON.stringify(response.user));
    onUser(response.user);
    setMessage(t("saved"));
  }

  return (
    <section className="workspace narrow">
      <form className="profile" onSubmit={submit}>
        <Input
          label={t("name")}
          value={form.name ?? ""}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        <Input
          label={t("lastName")}
          value={form.last_name ?? ""}
          onChange={(value) => setForm({ ...form, last_name: value })}
        />
        <Input
          label={t("email")}
          value={form.email ?? ""}
          onChange={(value) => setForm({ ...form, email: value })}
        />
        <Input
          label={t("phoneNumber")}
          value={form.phone_number ?? ""}
          onChange={(value) => setForm({ ...form, phone_number: value })}
        />
        <Input
          label={t("address")}
          value={form.address ?? ""}
          onChange={(value) => setForm({ ...form, address: value })}
        />
        {message && <p className="success">{message}</p>}
        <button className="primary">{t("save")}</button>
      </form>
    </section>
  );
}
