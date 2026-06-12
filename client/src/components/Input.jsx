import React from "react";

export default function Input({ label, type = "text", value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
