import React, { useEffect, useState } from "react";
import { resourceApi } from "../api.js";
import { useLang } from "../LangContext.jsx";

export default function CategoryManagementModal({ onClose, onChanged }) {
  const { t } = useLang();
  const [tab, setTab] = useState("main");
  const [mainCategories, setMainCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [mainForm, setMainForm] = useState({ id: null, name: "" });
  const [subForm, setSubForm] = useState({ id: null, name: "", tagline: "", description: "", mainCategoryId: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [mResult, sResult] = await Promise.all([
        resourceApi.list("main-categories", { per_page: 200 }),
        resourceApi.list("subcategories", { per_page: 500 }),
      ]);
      setMainCategories(mResult.data ?? []);
      setSubcategories(sResult.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function submitMain(event) {
    event.preventDefault();
    if (!mainForm.name.trim()) { setError(t("nameRequired")); return; }
    setError("");
    try {
      if (mainForm.id)
        await resourceApi.update("main-categories", mainForm.id, { name: mainForm.name });
      else
        await resourceApi.create("main-categories", { name: mainForm.name });
      setMainForm({ id: null, name: "" });
      await loadAll();
      await onChanged();
    } catch (err) { setError(err.message); }
  }

  async function removeMain(id) {
    setError("");
    try {
      await resourceApi.remove("main-categories", id);
      await loadAll();
      await onChanged();
    } catch (err) { setError(err.message); }
  }

  async function submitSub(event) {
    event.preventDefault();
    if (!subForm.name.trim()) { setError(t("nameRequired")); return; }
    setError("");
    try {
      const payload = {
        name: subForm.name,
        tagline: subForm.tagline || null,
        description: subForm.description || null,
        mainCategoryId: subForm.mainCategoryId || null,
      };
      if (subForm.id)
        await resourceApi.update("subcategories", subForm.id, payload);
      else
        await resourceApi.create("subcategories", payload);
      setSubForm({ id: null, name: "", tagline: "", description: "", mainCategoryId: "" });
      await loadAll();
      await onChanged();
    } catch (err) { setError(err.message); }
  }

  async function removeSub(id) {
    setError("");
    try {
      await resourceApi.remove("subcategories", id);
      await loadAll();
      await onChanged();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="modalBackdrop">
      <div className="modal categoryModal">
        <header>
          <h2>{t("categoryManagement")}</h2>
          <button type="button" onClick={onClose}>{t("close")}</button>
        </header>

        <div className="categoryTabs">
          <button
            type="button"
            className={tab === "main" ? "active" : ""}
            onClick={() => setTab("main")}
          >
            {t("mainCategories")}
          </button>
          <button
            type="button"
            className={tab === "sub" ? "active" : ""}
            onClick={() => setTab("sub")}
          >
            {t("subcategories")}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {tab === "main" ? (
          <form onSubmit={submitMain}>
            <div className="categoryManager">
              <label>
                <span>{t("name")}</span>
                <input
                  value={mainForm.name}
                  onChange={(e) => setMainForm({ ...mainForm, name: e.target.value })}
                  placeholder={t("exResidential")}
                />
              </label>
              <button className="primary">{mainForm.id ? t("update") : t("add")}</button>
              {mainForm.id && (
                <button type="button" onClick={() => setMainForm({ id: null, name: "" })}>
                  {t("cancel")}
                </button>
              )}
            </div>
            <div className="categoryList">
              {loading ? (
                <p className="meta">{t("loading")}</p>
              ) : mainCategories.length === 0 ? (
                <p className="meta">{t("noMainCategories")}</p>
              ) : (
                mainCategories.map((mc) => (
                  <div className="categoryRow" key={mc.id}>
                    <strong>{mc.name}</strong>
                    <span>#{mc.id}</span>
                    <div>
                      <button type="button" onClick={() => setMainForm({ id: mc.id, name: mc.name })}>
                        {t("edit")}
                      </button>
                      <button type="button" className="danger" onClick={() => removeMain(mc.id)}>
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={submitSub}>
            <div className="categoryManager">
              <label>
                <span>{t("name")}</span>
                <input
                  value={subForm.name}
                  onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                  placeholder={t("exSplitAC")}
                />
              </label>
              <label>
                <span>{t("mainCategoryId")}</span>
                <select
                  value={subForm.mainCategoryId ?? ""}
                  onChange={(e) => setSubForm({ ...subForm, mainCategoryId: e.target.value })}
                >
                  <option value="">{t("noneOption")}</option>
                  {mainCategories.map((mc) => (
                    <option key={mc.id} value={mc.id}>{mc.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("categoryTagline")}</span>
                <input
                  value={subForm.tagline}
                  onChange={(e) => setSubForm({ ...subForm, tagline: e.target.value })}
                  placeholder={t("exTagline")}
                />
              </label>
              <label>
                <span>{t("description")}</span>
                <textarea
                  value={subForm.description}
                  onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
                  placeholder={t("exCategoryDescription")}
                  rows={3}
                />
              </label>
              <button className="primary">{subForm.id ? t("update") : t("add")}</button>
              {subForm.id && (
                <button
                  type="button"
                  onClick={() => setSubForm({ id: null, name: "", tagline: "", description: "", mainCategoryId: "" })}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
            <div className="categoryList">
              {loading ? (
                <p className="meta">{t("loading")}</p>
              ) : subcategories.length === 0 ? (
                <p className="meta">{t("noSubcategories")}</p>
              ) : (
                subcategories.map((sc) => (
                  <div className="categoryRow" key={sc.id}>
                    <div className="categoryRowInfo">
                      <strong>{sc.name}</strong>
                      {sc.tagline && <span className="categoryTagline">{sc.tagline}</span>}
                      {sc.description && <p className="categoryDescription">{sc.description}</p>}
                    </div>
                    <span>
                      {sc.main_category_name ? `${sc.main_category_name} / ` : ""}#{sc.id}
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => setSubForm({
                          id: sc.id,
                          name: sc.name,
                          tagline: sc.tagline ?? "",
                          description: sc.description ?? "",
                          mainCategoryId: sc.main_category_id ?? "",
                        })}
                      >
                        {t("edit")}
                      </button>
                      <button type="button" className="danger" onClick={() => removeSub(sc.id)}>
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
