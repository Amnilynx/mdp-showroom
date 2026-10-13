// Shared thumbnail + download/view affordance for a proof image stored as
// a base64 data URL (payment proof, change-request refund/deduction
// proof). A plain <a href="data:..."> is unreliable for "download" across
// browsers — some open it in a new tab instead of saving. Adding the
// `download` attribute fixes that everywhere a data: URL is used, so this
// wraps the thumbnail in both an openable link AND an explicit download
// link rather than relying on target="_blank" alone.
export default function ProofImage({ src, alt, fileName }) {
  if (!src) return null;
  return (
    <div className="proof-image-block">
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img src={src} alt={alt} className="payment-proof-thumb" />
      </a>
      <a
        href={src}
        download={fileName || "proof.jpg"}
        className="proof-download-link"
      >
        ⬇ Download image
      </a>
    </div>
  );
}