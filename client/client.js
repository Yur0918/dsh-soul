window.__ModuleLoader__.load({ id: "@yur0918/dsh-soul", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var STYLE_OPTIONS = [
  { id: "default", label: "\u9ED8\u8BA4" },
  { id: "professional", label: "\u4E13\u4E1A\u4E25\u8C28" },
  { id: "friendly", label: "\u4EB2\u548C\u53CB\u5584" },
  { id: "straight", label: "\u76F4\u8A00\u4E0D\u8BB3" },
  { id: "whimsical", label: "\u5929\u9A6C\u884C\u7A7A" },
  { id: "pragmatic", label: "\u9AD8\u6548\u52A1\u5B9E" },
  { id: "roast", label: "\u6BD2\u820C\u5410\u69FD" },
  { id: "coaching", label: "\u542F\u53D1\u5F15\u5BFC" },
  { id: "humorous", label: "\u5E7D\u9ED8\u98CE\u8DA3" }
];
var LANG_OPTIONS = [
  { id: "zh", label: "\u4E2D\u6587" },
  { id: "en", label: "English" }
];
var name = "dsh-soul";
var inject = ["slots"];
function apply(ctx) {
  const { inject: slotsInject, register: slotsRegister } = ctx.slots;
  slotsInject(
    "settings.section",
    () => slotsRegister(
      { name: "settings.section", id: "soul", order: 60, label: () => "\u4E2A\u6027\u5316" },
      () => (0, import_dsh_client_ui_primitives.h)(SoulSection)
    )
  );
}
function SoulSection() {
  const [form, setForm] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("");
  const [saving, setSaving] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    let alive = true;
    void fetch("/dsh-soul/config").then((r) => r.json()).then((body) => {
      if (!alive) return;
      if (body?.ok && body.config) {
        setForm({
          enabled: Boolean(body.config.enabled),
          nickname: String(body.config.nickname ?? ""),
          occupation: String(body.config.occupation ?? ""),
          bio: String(body.config.bio ?? ""),
          style: String(body.config.style ?? "default"),
          language: body.config.language === "en" ? "en" : "zh",
          customInstructions: String(body.config.customInstructions ?? "")
        });
      } else {
        setStatus("\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF1A" + JSON.stringify(body).slice(0, 120));
      }
    }).catch((error) => {
      if (alive) setStatus("\u8BFB\u53D6\u5931\u8D25\uFF1A" + String(error));
    });
    return () => {
      alive = false;
    };
  }, []);
  const set = (patch) => setForm((prev) => prev === null ? null : { ...prev, ...patch });
  const save = () => {
    if (form === null) return;
    setSaving(true);
    setStatus("");
    void fetch("/dsh-soul/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    }).then(async (r) => ({ status: r.status, body: await r.json() })).then(({ status: status2, body }) => {
      setSaving(false);
      setStatus(status2 === 200 && body.ok ? "\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u4E00\u6B21\u56DE\u590D\u751F\u6548\u3002" : humanizeSaveError(body));
    }).catch((error) => {
      setSaving(false);
      setStatus("\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(error));
    });
  };
  const reset = () => {
    if (form === null) return;
    setSaving(true);
    void fetch("/dsh-soul/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, style: "default", language: "zh", nickname: "", occupation: "", bio: "", customInstructions: "" })
    }).then(async (r) => ({ status: r.status, body: await r.json() })).then(({ status: status2, body }) => {
      setSaving(false);
      if (status2 === 200 && body.ok && body.config) {
        setForm({ enabled: true, nickname: "", occupation: "", bio: "", style: "default", language: "zh", customInstructions: "" });
        setStatus("\u5DF2\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u3002");
      } else setStatus("\u91CD\u7F6E\u5931\u8D25\uFF1A" + humanizeSaveError(body));
    }).catch((error) => {
      setSaving(false);
      setStatus("\u91CD\u7F6E\u5931\u8D25\uFF1A" + String(error));
    });
  };
  if (form === null) {
    return (0, import_dsh_client_ui_primitives.h)("div", { style: { color: "#6b7280" } }, status !== "" ? status : "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026");
  }
  const field = (label, children) => (0, import_dsh_client_ui_primitives.h)(
    "label",
    { style: { display: "block", margin: "10px 0", fontSize: "13px", color: "#374151" } },
    (0, import_dsh_client_ui_primitives.h)("div", { style: { marginBottom: "4px", fontWeight: 600 } }, label),
    children
  );
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };
  return (0, import_dsh_client_ui_primitives.h)(
    "div",
    { style: { maxWidth: "560px" } },
    (0, import_dsh_client_ui_primitives.h)("div", { style: { marginBottom: "8px", fontSize: "14px", fontWeight: 600 } }, "SoulFusion \u2014 dsh-soul v2 \u4E2A\u6027\u5316"),
    field("\u56DE\u590D\u98CE\u683C", (0, import_dsh_client_ui_primitives.h)(
      "select",
      { value: form.style, onChange: (e) => set({ style: e.target.value }), style: inputStyle },
      STYLE_OPTIONS.map((opt) => (0, import_dsh_client_ui_primitives.h)("option", { key: opt.id, value: opt.id }, `${opt.label}\uFF08${opt.id}\uFF09`))
    )),
    field("\u56DE\u590D\u8BED\u8A00", (0, import_dsh_client_ui_primitives.h)(
      "select",
      { value: form.language, onChange: (e) => set({ language: e.target.value }), style: inputStyle },
      LANG_OPTIONS.map((opt) => (0, import_dsh_client_ui_primitives.h)("option", { key: opt.id, value: opt.id }, opt.label))
    )),
    field("\u6635\u79F0", (0, import_dsh_client_ui_primitives.h)("input", { value: form.nickname, maxLength: 50, onChange: (e) => set({ nickname: e.target.value }), style: inputStyle, placeholder: "\u6A21\u578B\u5BF9\u4F60\u7684\u79F0\u547C\uFF08\u53EF\u9009\uFF09" })),
    field("\u804C\u4E1A", (0, import_dsh_client_ui_primitives.h)("input", { value: form.occupation, maxLength: 50, onChange: (e) => set({ occupation: e.target.value }), style: inputStyle, placeholder: "\u53EF\u9009" })),
    field("\u4ECB\u7ECD", (0, import_dsh_client_ui_primitives.h)("textarea", { value: form.bio, maxLength: 500, onChange: (e) => set({ bio: e.target.value }), style: { ...inputStyle, minHeight: "60px", resize: "vertical" }, placeholder: "\u4E00\u53E5\u8BDD\u4ECB\u7ECD\u81EA\u5DF1\uFF08\u53EF\u9009\uFF09" })),
    field("\u81EA\u5B9A\u4E49\u6307\u4EE4", (0, import_dsh_client_ui_primitives.h)("textarea", { value: form.customInstructions, maxLength: 2e3, onChange: (e) => set({ customInstructions: e.target.value }), style: { ...inputStyle, minHeight: "70px", resize: "vertical" }, placeholder: "\u4F8B\u5982\uFF1A\u56DE\u7B54\u5148\u7ED9\u7ED3\u8BBA\u518D\u5C55\u5F00\uFF1B\u7528\u4E2D\u6587\u56DE\u590D\u3002" })),
    (0, import_dsh_client_ui_primitives.h)(
      "div",
      { style: { marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" } },
      (0, import_dsh_client_ui_primitives.h)("button", { type: "button", disabled: saving, onClick: save, style: { padding: "6px 16px", borderRadius: "6px", border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: saving ? "default" : "pointer" } }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E"),
      (0, import_dsh_client_ui_primitives.h)("button", { type: "button", disabled: saving, onClick: reset, style: { padding: "6px 16px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", cursor: saving ? "default" : "pointer" } }, "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4"),
      (0, import_dsh_client_ui_primitives.h)("span", { style: { fontSize: "12px", color: status.startsWith("\u4FDD\u5B58\u5931\u8D25") || status.startsWith("\u8BFB\u53D6\u5931\u8D25") || status.startsWith("\u91CD\u7F6E\u5931\u8D25") ? "#b91c1c" : status !== "" ? "#0f6f4f" : "#6b7280" } }, status)
    ),
    (0, import_dsh_client_ui_primitives.h)("div", { style: { marginTop: "10px", fontSize: "12px", color: "#9ca3af" } }, "\u98CE\u683C\u3001\u8BED\u8A00\u4E0E\u6307\u4EE4\u968F\u4E0B\u4E00\u6B21\u56DE\u590D\u751F\u6548\uFF1B\u4EBA\u8BBE\u5361/\u8BB0\u5FC6/\u5BA1\u8BA1\u9762\u677F\u5728 MV3 \u52A0\u5165\u3002")
  );
}
function humanizeSaveError(body) {
  const detail = body.errors?.join("\uFF1B") ?? body.error ?? JSON.stringify(body).slice(0, 120);
  return "\u4FDD\u5B58\u5931\u8D25\uFF1A" + detail;
}
return module.exports; } });
