// Generates a downloadable PDF receipt/invoice for a single order, used by
// both OrderTicket.jsx (customer's own order) and OrderDetail.jsx (admin,
// any order). Pure client-side — jsPDF renders directly in the browser and
// triggers a save, no server round-trip needed.
//
// This is a RECORD of what was agreed/paid, not a legal invoice (no VAT/
// BIR official-receipt numbering) — matches the "not legally binding,
// purely tracking purposes" scope already set for the change-request
// tracker elsewhere in this app.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getPayableTotal, STATUS_LABELS, paymentMethodLabel, depositPercentLabel, isPureCustom } from "./orders";

// TODO: replace with the real business address/phone once available —
// same placeholder pattern as the bank account number in orders.js.
const BUSINESS_NAME = "MDP Modular Systems";
const BUSINESS_SUBTITLE = "Custom Modular Furniture";

function formatDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateOrderReceipt(order) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;

  // ---------- Header ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(BUSINESS_NAME, marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  y += 16;
  doc.text(BUSINESS_SUBTITLE, marginX, y);
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Order Receipt", pageWidth - marginX, 56, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    order.orderCode || `Draft — ${order.id.slice(0, 8)}`,
    pageWidth - marginX,
    72,
    { align: "right" }
  );
  doc.text(`Printed ${formatDate(new Date())}`, pageWidth - marginX, 86, { align: "right" });

  y = 112;
  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  // ---------- Customer & order info ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Billed To", marginX, y);
  doc.text("Order Info", pageWidth / 2 + 12, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const leftLines = [
    order.contact?.name || "—",
    order.contact?.email || "",
    order.contact?.phone || "",
    order.siteAddress || order.location || "",
  ].filter(Boolean);
  const rightLines = [
    `Status: ${STATUS_LABELS[order.status] || order.status}`,
    isPureCustom(order) ? "Type: Pure custom (company)" : null,
    `Date ordered: ${formatDate(order.createdAt)}`,
    order.confirmedVisitDate ? `Site visit: ${order.confirmedVisitDate}` : null,
    order.scheduledDeliveryDate ? `Delivery: ${order.scheduledDeliveryDate}` : null,
  ].filter(Boolean);

  const colStartY = y;
  leftLines.forEach((line, i) => doc.text(line, marginX, colStartY + i * 14));
  rightLines.forEach((line, i) => doc.text(line, pageWidth / 2 + 12, colStartY + i * 14));
  y = colStartY + Math.max(leftLines.length, rightLines.length) * 14 + 20;

  // ---------- Line items ----------
  const rows = isPureCustom(order)
    ? [["Pure custom commission", (order.projectDetails || "As discussed").slice(0, 120), order.finalPrice ? peso(order.finalPrice) : "To be quoted"]]
    : (order.configurations || []).map((c) => [
    `${c.furnitureName}${c.shapeType ? ` — ${c.shapeType}` : ""}`,
    [c.finish, c.hardware].filter(Boolean).join(" · ") || "—",
    peso(c.subtotal),
  ]);

  const hardwareInstall =
    (order.provisionalTotal || 0) -
    (order.configurations || []).reduce((s, c) => s + (c.subtotal || 0), 0);
  if (hardwareInstall) {
    rows.push(["Hardware & installation", "—", peso(hardwareInstall)]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Item", "Details", "Amount"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [138, 90, 59], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: { 2: { halign: "right" } },
  });

  y = doc.lastAutoTable.finalY + 20;

  // ---------- Totals ----------
  const totalRows = [
    ["Provisional / System Estimate", peso(order.provisionalTotal)],
  ];
  if (order.finalPrice) {
    totalRows.push(["Confirmed Final Price", peso(order.finalPrice)]);
  }
  if (order.adjustmentsTotal) {
    totalRows.push([
      "Accepted Changes (net)",
      `${order.adjustmentsTotal > 0 ? "+" : "−"}${peso(Math.abs(order.adjustmentsTotal))}`,
    ]);
  }
  const payable = getPayableTotal(order);
  totalRows.push(["Current Payable Total", peso(payable)]);

  const depositAmount = order.finalDepositAmount ?? order.depositAmount ?? 0;
  if (depositAmount) {
    totalRows.push([
      order.depositConfirmed
        ? `Deposit Paid & Verified (${depositPercentLabel(order)})`
        : `Deposit Due (${depositPercentLabel(order)})`,
      peso(depositAmount),
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: pageWidth / 2, right: marginX },
    body: totalRows,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: "normal" }, 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      // Bold + highlight the "current payable" row so it reads as the
      // headline number, not just another line in the stack.
      if (data.row.raw[0] === "Current Payable Total") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 11;
        data.cell.styles.textColor = [138, 90, 59];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 24;

  // ---------- Payment reference, if any ----------
  if (order.paymentReference) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Payment Reference", marginX, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(
      `${paymentMethodLabel(order.paymentMethod)} · Ref: ${order.paymentReference}`,
      marginX,
      y
    );
    y += 14;
    doc.text(
      order.depositConfirmed ? "Status: Verified" : "Status: Awaiting verification",
      marginX,
      y
    );
    y += 20;
  }

  // ---------- Progress billings and the final 10% ----------
  if ((order.billings || []).length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("Billings", marginX, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Billing", "Issued", "Amount", "Status"]],
      body: order.billings.map((b) => [
        b.label,
        b.issuedAt ? new Date(b.issuedAt).toLocaleDateString("en-PH") : "",
        "PHP " + Number(b.amount).toLocaleString(),
        b.paidAt ? "Paid" : "Awaiting payment",
      ]),
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fontStyle: "bold" },
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  // ---------- Footer note ----------
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    "This document is a record of your order and payments for tracking purposes only — it is not an official receipt or invoice.",
    marginX,
    doc.internal.pageSize.getHeight() - 40,
    { maxWidth: pageWidth - marginX * 2 }
  );

  const fileName = `${(order.orderCode || order.id.slice(0, 8)).replace(/[^\w-]/g, "_")}_receipt.pdf`;
  doc.save(fileName);
}