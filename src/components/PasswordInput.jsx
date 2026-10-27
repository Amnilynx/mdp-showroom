import { useState } from "react";

// Password field with a Show / Hide button.
export default function PasswordInput({ value, onChange, autoComplete = "current-password", required = true, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <span style={{ position: "relative", display: "block" }}>
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        style={{ width: "100%", paddingRight: 64, boxSizing: "border-box" }}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", fontSize: 12,
          fontWeight: 700, color: "#6b6b6b", padding: "4px 8px", width: "auto",
        }}
      >
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}