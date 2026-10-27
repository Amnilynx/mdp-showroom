// Shared form checks. Every function returns "" when the value is fine or a
// short message the person can act on, so a form can do:
//   const problem = checkPhone(phone); if (problem) { setError(problem); return; }

export function normalizePhone(raw) {
  return String(raw || "").replace(/[\s\-().]/g, "");
}

// Philippine mobile numbers: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX.
export function isValidPhone(raw) {
  return /^(\+63|63|0)9\d{9}$/.test(normalizePhone(raw));
}

export function checkPhone(raw, { required = true } = {}) {
  const v = String(raw || "").trim();
  if (!v) return required ? "Please enter your mobile number." : "";
  if (!isValidPhone(v)) {
    return "Enter a valid Philippine mobile number, like 0917 123 4567 or +63 917 123 4567. Letters and symbols aren't allowed.";
  }
  return "";
}

export function checkEmail(raw) {
  const v = String(raw || "").trim();
  if (!v) return "Please enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email address, like name@example.com.";
  return "";
}

export function checkName(raw, label = "name") {
  const v = String(raw || "").trim();
  if (v.length < 2) return `Please enter your ${label}.`;
  if (!/[A-Za-zÀ-ɏ]/.test(v)) return `Your ${label} must contain letters.`;
  return "";
}

export function checkRequired(raw, label, min = 1) {
  const v = String(raw || "").trim();
  if (!v) return `Please fill in ${label}.`;
  if (v.length < min) return `${label[0].toUpperCase() + label.slice(1)} needs at least ${min} characters.`;
  return "";
}

export function checkUrl(raw, { required = false } = {}) {
  const v = String(raw || "").trim();
  if (!v) return required ? "Please enter a link." : "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
    if (!u.hostname.includes(".")) throw new Error("host");
  } catch {
    return "That link doesn't look right. It should start with https://";
  }
  return "";
}

export function checkPassword(raw) {
  const v = String(raw || "");
  if (v.length < 8) return "Password needs at least 8 characters.";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Password needs at least one letter and one number.";
  return "";
}

// Today as YYYY-MM-DD in the device's own timezone (what <input type="date"> uses).
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function checkFutureDate(iso, label = "date", { required = false } = {}) {
  if (!iso) return required ? `Please choose a ${label}.` : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `That ${label} isn't valid.`;
  if (iso < todayISO()) return `The ${label} can't be in the past. Choose today or a later date.`;
  return "";
}

export function checkPrice(raw, label = "price") {
  const s = String(raw ?? "").trim();
  if (s === "") return `Please enter a ${label}.`;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return `The ${label} must be a number, zero or more.`;
  return "";
}

// ---- Image uploads ----
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // before the app shrinks it

function canDecode(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

// Checks type, size and that the file is a real, readable picture
// (a renamed or damaged file fails here instead of uploading).
export async function checkImageFiles(files) {
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) {
      return `"${f.name}" isn't a supported picture. Use a JPG, PNG, WEBP or GIF photo or screenshot.`;
    }
    if (f.size === 0) return `"${f.name}" is empty.`;
    if (f.size > MAX_IMAGE_BYTES) {
      return `"${f.name}" is too large (${(f.size / 1048576).toFixed(1)} MB). The limit is ${MAX_IMAGE_BYTES / 1048576} MB.`;
    }
    if (!(await canDecode(f))) return `"${f.name}" is damaged or isn't a real picture, so it can't be uploaded.`;
  }
  return "";
}

// Firebase / Firestore error -> sentence for the screen.
export function friendlyError(err, fallback = "Something went wrong.") {
  const code = String(err?.code || "").replace(/^(firestore|auth)\//, "");
  const map = {
    "permission-denied": "You don't have permission to do that. Try signing out and in again.",
    unavailable: "Can't reach the server. Check your internet connection and try again.",
    "network-request-failed": "Can't reach the server. Check your internet connection and try again.",
    unauthenticated: "Your session expired. Please sign in again.",
    "deadline-exceeded": "The server took too long to answer. Try again.",
    "not-found": "That item no longer exists.",
  };
  const msg = map[code] || err?.message || fallback;
  return code && !map[code] ? `${msg} (${code})` : msg;
}