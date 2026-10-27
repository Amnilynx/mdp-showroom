// Shared thumbnail + view/download for a proof image stored as a base64 data URL.
//
// Browsers (Chrome especially) block opening a data: URL in a new tab, so a plain
// <a href="data:..." target="_blank"> does nothing when clicked. Here the image is
// turned into a temporary blob: URL first, which opens and downloads reliably.
function dataUrlToBlobUrl(src) {
  if (!src.startsWith("data:")) return src; // already a normal link
  const [head, body = ""] = src.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = head.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export default function ProofImage({ src, alt, fileName }) {
  if (!src) return null;

  function view(e) {
    e.preventDefault();
    try {
      const url = dataUrlToBlobUrl(src);
      const w = window.open(url, "_blank", "noopener");
      if (!w) alert("Your browser blocked the pop-up. Allow pop-ups for this site, or use the Download link.");
    } catch {
      alert("Couldn't open this image. Try the Download link instead.");
    }
  }

  function download(e) {
    e.preventDefault();
    try {
      const url = dataUrlToBlobUrl(src);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "proof.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert("Couldn't download this image.");
    }
  }

  return (
    <div className="proof-image-block">
      <a href={src} onClick={view} target="_blank" rel="noopener noreferrer">
        <img src={src} alt={alt} className="payment-proof-thumb" />
      </a>
      <a href={src} onClick={download} download={fileName || "proof.jpg"} className="proof-download-link">
        ⬇ Download image
      </a>
    </div>
  );
}