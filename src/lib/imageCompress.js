// Compresses an uploaded image file into a small base64 JPEG data URL,
// small enough to store directly as a Firestore field (1 MiB document cap,
// minus room for the rest of the order's data). We don't have Firebase
// Storage (would require the Blaze billing plan), so payment-proof
// screenshots are stored inline on the order doc instead — this keeps them
// comfortably under ~250KB each, well within the limit.
//
// Resizes to fit within maxDimension on the longer side and re-encodes as
// JPEG at the given quality, which is more than enough detail to read a
// GCash/bank receipt's reference number and amount.
export function compressImageToDataUrl(file, { maxDimension = 1000, quality = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please upload an image file."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; // flatten transparency (e.g. PNG screenshots)
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);

        // Rough safety check — base64 is ~33% larger than raw bytes.
        // If still too big (e.g. a huge original), compress harder once more.
        const approxBytes = Math.round((dataUrl.length * 3) / 4);
        if (approxBytes > 700000 && quality > 0.4) {
          canvas.toBlob(
            () => {}, // no-op, we just need toDataURL again at lower quality
          );
          resolve(canvas.toDataURL("image/jpeg", 0.4));
          return;
        }

        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}