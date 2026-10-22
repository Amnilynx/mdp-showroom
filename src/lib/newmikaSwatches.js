// Real NewMika (Mikasa Laminates) decor swatches — one of the company's
// actual suppliers. Used by the admin Add/Edit Furniture form so staff can
// pick a genuine material swatch instead of pasting URLs by hand.
//
// To add more: open https://www.newmika.com.ph, open a laminate's page,
// right-click its swatch photo -> "Copy image address", and add a row here.
//   - name:     what customers will see (keep it the supplier's name)
//   - code:     NewMika's decor code (shown to admin only)
//   - imageUrl: the copied image address
//   - colorHex: approximate average color, used for the small tile
//               (any color-picker / eyedropper on the photo works)
//
// Images are hotlinked from newmika.com.ph; the customer page already falls
// back to a "Reference photo unavailable" box if a link ever breaks.

export const NEWMIKA_SWATCHES = [
  {
    name: "Classic Mahogany",
    code: "3036 SUD",
    series: "Wood grain",
    imageUrl:
      "https://www.newmika.com.ph/wp-content/uploads/2024/07/3036-Classic-Mahogany-SUD-Laminate-800x1600.jpg",
    colorHex: "#4a2c22",
  },
  {
    name: "Satin White",
    code: "33502 MXT",
    series: "MattX",
    imageUrl:
      "https://www.newmika.com.ph/wp-content/uploads/2026/10/33502-MattX-Satin-White-MXT-800x1600.jpg",
    colorHex: "#f1efea",
  },
  {
    name: "Preto Black",
    code: "33872 MXT",
    series: "MattX",
    imageUrl:
      "https://www.newmika.com.ph/wp-content/uploads/2026/10/33872-MattX-Preto-Black-MXT-800x1600.jpg",
    colorHex: "#1f1f1f",
  },
  {
    name: "Lush Green",
    code: "33582 MXT",
    series: "MattX",
    imageUrl:
      "https://www.newmika.com.ph/wp-content/uploads/2026/10/33582-MattX-Lush-Green-MXT-800x1600.jpg",
    colorHex: "#3f6b4a",
  },
];

export const NEWMIKA_SITE_URL = "https://www.newmika.com.ph/";