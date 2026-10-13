# MDP Modular Systems — Architecture Plan

## 1. Order Status Lifecycle (single field, one source of truth)

Stored as `order.status`, one of:

1. `request_received`
2. `under_review`
3. `est_price_issued`
4. `approved`
5. `in_production`
6. `ready_for_delivery`
7. `completed`
8. `rejected` / `cancelled` (terminal, can branch off at 2 or 3)

Admin's "Update status" dropdown moves this field forward (or to rejected/cancelled).
Customer's ticket page (Screen 6) just renders progress along this same field —
the "How it works" sidebar becomes static explainer copy, not separate data.

## 1a. Order Code Assignment

- On creation, an order has **no `orderCode`** — only its Firestore auto-ID. Customer's ticket
  page shows this as a draft/reference state (e.g. "Draft — awaiting review") rather than a
  formatted code.
- Admin manually types in the `orderCode` (free text input, e.g. "CR-701") from the Order
  Detail screen, typically once the deposit is approved (status moves to `approved` or later).
- No auto-increment/counter logic needed — admin owns the numbering scheme entirely.
- Once assigned, `orderCode` displays everywhere in place of the raw Firestore ID (ticket page,
  admin orders list/detail).

## 2. Firestore Collections

### `users`
```
{
  uid,               // == Firebase Auth uid
  role: "customer" | "manager",
  fullName,
  email,
  phone,
  createdAt
}
```

### `categories`
```
{
  id,                // "modular-kitchens" | "walk-in-closets" | "media-cabinets" | "file-storage"
  name,
  tag: "Residential" | "Commercial",
  imageUrl,
  description
}
```

### `furniture`
```
{
  id,
  name,                     // "Meridian Kitchen"
  categoryId,
  shapeType,                 // "Straight" | "L-Shape" | "U-Shape" | "Island"
  basePrice,
  imageUrl,
  description,
  materials: [string],
  colors: [string],
  options: [string],
  sizeOptions: [
    { type: "Straight", price: 95000 },
    { type: "L-Shape", price: 120000 },
    { type: "U-Shape", price: 180000 }
  ],
  finishOptions: [
    { name: "Dark Walnut", priceAddOn: 0 },
    { name: "Waterfall edge", priceAddOn: 12000 }
  ],
  hardwareOptions: [
    { name: "J-Pull", priceAddOn: 0 },
    { name: "Push-open", priceAddOn: 3000 }
  ],
  defaultDimensions: { w, d, h },   // cm
  active: true
}
```

### `orders`  (== a submitted quote request; may bundle multiple configured items)
```
{
  id,                        // Firestore auto-ID, always present (internal key)
  orderCode,                 // null until admin assigns it (e.g. "CR-701")
                              //  - customer sees Firestore id / "Draft" while null
                              //  - admin types this in manually once deposit is approved
                              //  - assigned at/after status = "approved"
  customerId,                // ref -> users
  status,                    // see lifecycle above
  configurations: [
    {
      furnitureId,
      furnitureName,
      shapeType,
      finish,
      hardware,
      dimensions: { w, d, h },
      customRequest: { part: "Countertop", note: "..." },  // optional
      basePrice,
      addOnsTotal,
      subtotal
    }
  ],
  provisionalTotal,
  depositAmount,              // 50% of provisionalTotal
  contact: { name, email, phone },
  location,
  siteAddress,
  preferredVisitDate,
  floorPlanUrl,                // optional, image URL (no Storage)
  projectDetails,
  consentGiven: true,
  adminNotes: [                // replaces chat — simple status/notes log
    { authorId, note, createdAt }
  ],
  createdAt,
  updatedAt
}
```

## 3. Routes

### Customer (public + auth-gated where noted)
- `/` — Homepage
- `/showroom` — Choose Type (category grid)
- `/showroom/:categoryId` — Browse List
- `/showroom/:categoryId/:furnitureId/customize` — Customize
- `/quote-request` — Request Quote (cart of configurations) [auth required to submit]
- `/orders/:orderId` — Ticket / tracking view [auth required]
- `/login`, `/register`

### Admin (role: manager only, route-guarded)
- `/admin` — Overview
- `/admin/orders` — Orders list
- `/admin/orders/:orderId` — Order detail (journey tracker, notes, status update)
- `/admin/showroom` — Furniture list
- `/admin/showroom/add`, `/admin/showroom/:id/edit`
- `/admin/reports` — Charts

## 3a. Manager account

- Seeded manually in the Firebase console (Authentication tab, add user with email/password),
  then a matching doc created in `users/{uid}` with `role: "manager"`.
- Single shared Google account/project owns all data — no multi-tenant concerns, no in-app
  manager-creation flow needed.

## 4. Key interactions to build

- **Configuration cart**: customer can customize multiple items before submitting one combined quote request (Screen 5 shows 2 selected configurations).
- **Live price calc**: `basePrice(shape) + sum(finish/hardware addOns)` recalculated on every option change, client-side.
- **Role-gated routing**: after login, check `users/{uid}.role`; manager → `/admin`, customer → normal site.
- **Status-driven UI**: both customer ticket page and admin order detail read/render off the same `status` enum — no duplicate tracking logic.
