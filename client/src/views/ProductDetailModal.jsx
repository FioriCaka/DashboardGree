import React, { useEffect, useState } from "react";
import { productImageApi, resourceApi } from "../api.js";
import { assetUrl } from "../config.js";
import { useLang } from "../LangContext.jsx";

function Spec({ label, value }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="specRow">
      <span className="specLabel">{label}</span>
      <span className="specValue">{value === true ? "✓" : String(value)}</span>
    </div>
  );
}

function ProductImageManager({ productId, images, onChanged }) {
  const { t } = useLang();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await productImageApi.upload(productId, file);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(imageId) {
    if (!confirm(t("deleteImageConfirm"))) return;
    setError("");
    try {
      await productImageApi.remove(productId, imageId);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSetMain(imageId) {
    setError("");
    try {
      await productImageApi.setMain(productId, imageId);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="imgManager">
      <div className="imgManagerHeader">
        <strong>{t("imagesLabel")}</strong>
        <label className={`imgUploadBtn${uploading ? " disabled" : ""}`}>
          {uploading ? t("uploading") : t("addImage")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {error && <p className="error" style={{ margin: "0 0 8px" }}>{error}</p>}
      {images.length === 0 ? (
        <p className="meta">{t("noImages")}</p>
      ) : (
        <div className="imgManagerGrid">
          {images.map((img) => (
            <div key={img.id} className={`imgManagerItem${img.is_main ? " main" : ""}`}>
              <img src={assetUrl(img.image_path)} alt="" />
              {img.is_main && <span className="imgMainBadge">{t("setMain")}</span>}
              <div className="imgManagerActions">
                {!img.is_main && (
                  <button type="button" onClick={() => handleSetMain(img.id)}>
                    {t("setMain")}
                  </button>
                )}
                <button type="button" className="danger" onClick={() => handleDelete(img.id)}>
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductDetailModal({ row, onClose, onEdit, onDeleted }) {
  const { t } = useLang();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImg, setSelectedImg] = useState(0);
  const [deleting, setDeleting] = useState(false);

  function loadProduct() {
    setLoading(true);
    setError("");
    resourceApi
      .show("products", row.id)
      .then((res) => {
        setProduct(res.data);
        setSelectedImg(0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProduct(); }, [row.id]);

  async function handleDelete() {
    if (!confirm(t("deleteProductConfirm").replace("{name}", row.name))) return;
    setDeleting(true);
    try {
      await resourceApi.remove("products", row.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  const images = product?.images ?? [];
  const heroUrl =
    images.length > 0
      ? assetUrl(images[selectedImg]?.image_path)
      : assetUrl(product?.display_image ?? product?.main_image ?? product?.image);

  const featureGroups = (product?.feature_values ?? []).reduce((acc, fv) => {
    if (!acc[fv.feature_name]) acc[fv.feature_name] = [];
    acc[fv.feature_name].push(fv.variant_name);
    return acc;
  }, {});

  const optionGroups = (product?.options ?? []).reduce((acc, opt) => {
    if (!acc[opt.option_name]) acc[opt.option_name] = [];
    acc[opt.option_name].push(opt.variant_name);
    return acc;
  }, {});

  const priceTiers = (product?.prices ?? []).filter((p) => p.lower_limit > 0 || p.usergroup_name);

  return (
    <div className="modalBackdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal productDetailModal">
        <header>
          <h2>{row.name}</h2>
          <button type="button" onClick={onClose}>{t("close")}</button>
        </header>

        {loading && <p className="meta" style={{ padding: "1.5rem" }}>{t("loadingDetails")}</p>}
        {error && <p className="error" style={{ padding: "1rem" }}>{error}</p>}

        {product && (
          <>
            <div className="productDetailBody">
              <div className="productDetailHero">
                {heroUrl ? (
                  <img src={heroUrl} alt={product.name} className="heroImg" />
                ) : (
                  <div className="heroPlaceholder">{t("noImage")}</div>
                )}
                {images.length > 1 && (
                  <div className="thumbStrip">
                    {images.map((img, idx) => (
                      <img
                        key={img.id}
                        src={assetUrl(img.image_path)}
                        alt=""
                        className={`thumb${idx === selectedImg ? " active" : ""}`}
                        onClick={() => setSelectedImg(idx)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="productDetailInfo">
                <div className="badgeRow">
                  {product.category_path_label && (
                    <span className="badge">{product.category_path_label}</span>
                  )}
                  {product.imported && (
                    <span className="badge imported">IMPORTUAR</span>
                  )}
                </div>

                <div className="specGrid">
                  <Spec label={t("sku_label")} value={product.sku} />
                  <Spec label={t("model")} value={product.model} />
                  <Spec label={t("productCode")} value={product.product_code} />
                  <Spec label={t("priceLabel")} value={product.price != null ? `${Number(product.price).toLocaleString()} ALL` : null} />
                  <Spec label={t("oldPriceLabel")} value={product.old_price != null ? `${Number(product.old_price).toLocaleString()} ALL` : null} />
                  <Spec label={t("btuLabel")} value={product.btu} />
                  <Spec label={t("energyClassLabel")} value={product.energy_class} />
                  <Spec label={t("seer")} value={product.seer} />
                  <Spec label={t("scop")} value={product.scop} />
                  <Spec label={t("wifiEnabled")} value={product.wifi_enabled} />
                  <Spec label={t("heatingLabel")} value={product.heating_cooling} />
                  <Spec label={t("seriesLabel")} value={product.series} />
                  <Spec label={t("warrantyLabel")} value={product.warranty_years ? `${product.warranty_years} ${t("warrantyYears")}` : null} />
                  <Spec label={t("stockLabel")} value={product.stock} />
                  <Spec label={t("inStoreLabel")} value={product.in_store} />
                  <Spec label={t("inHandLabel")} value={product.in_hand} />
                  <Spec label={t("installPriceLabel")} value={product.installation_price != null ? `${Number(product.installation_price).toLocaleString()} ALL` : null} />
                  <Spec label={t("maintPriceLabel")} value={product.maintenance_price != null ? `${Number(product.maintenance_price).toLocaleString()} ALL` : null} />
                </div>

                {product.description && (
                  <div className="productDesc">
                    <strong>{t("descriptionLabel")}</strong>
                    <p>{product.description}</p>
                  </div>
                )}

                {Object.keys(featureGroups).length > 0 && (
                  <div className="detailSection">
                    <strong>{t("specificationsLabel")}</strong>
                    <table className="featureTable">
                      <tbody>
                        {Object.entries(featureGroups).map(([feat, vals]) => (
                          <tr key={feat}>
                            <td>{feat}</td>
                            <td>{vals.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {Object.keys(optionGroups).length > 0 && (
                  <div className="detailSection">
                    <strong>{t("optionsLabel")}</strong>
                    {Object.entries(optionGroups).map(([optName, vals]) => (
                      <div key={optName} className="optionGroup">
                        <span className="optionLabel">{optName}:</span>
                        {vals.map((v) => (
                          <span key={v} className="chip">{v}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {priceTiers.length > 0 && (
                  <div className="detailSection">
                    <strong>{t("priceTiersLabel")}</strong>
                    <table className="featureTable">
                      <thead>
                        <tr>
                          <th>{t("groupLabel")}</th>
                          <th>{t("minQtyLabel")}</th>
                          <th>{t("priceAllLabel")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceTiers.map((tier, i) => (
                          <tr key={i}>
                            <td>{tier.usergroup_name ?? "—"}</td>
                            <td>{tier.lower_limit}</td>
                            <td>{Number(tier.price).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {product.manual_url && (
                  <div className="detailSection">
                    <a href={product.manual_url} target="_blank" rel="noreferrer">
                      {t("viewManual")}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <ProductImageManager
              productId={product.id}
              images={product.images ?? []}
              onChanged={loadProduct}
            />
          </>
        )}

        <footer>
          <button type="button" onClick={onClose}>{t("close")}</button>
          <button type="button" onClick={onEdit}>{t("edit")}</button>
          <button type="button" className="danger" disabled={deleting} onClick={handleDelete}>
            {deleting ? t("deleting") : t("delete")}
          </button>
        </footer>
      </div>
    </div>
  );
}
