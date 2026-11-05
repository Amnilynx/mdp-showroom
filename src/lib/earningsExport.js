// Turns the numbers from earningsReport.js into a PDF summary and an .xlsx file.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { STATUS_LABELS } from "./orders";

// Standard PDF fonts have no peso glyph, so the PDF writes "PHP".
const php = (n) => "PHP " + Math.round(n || 0).toLocaleString("en-PH");
const dateLabel = (r) =>
  r.from || r.to ? `${r.from || "the beginning"} to ${r.to || "today"}` : "All time";
const stamp = () => new Date().toISOString().slice(0, 10);

const HEAD = ["Orders", "Confirmed value", "Received", "Still to collect", "To refund", "Estimated (unpriced)"];
const cells = (r) => [String(r.orders), php(r.value), php(r.received), php(r.toCollect), php(r.toRefund), php(r.estimated)];

export function exportEarningsPdf(report) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const w = doc.internal.pageSize.getWidth();
  const mx = 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MDP Modular Systems", mx, 48);
  doc.setFontSize(13);
  doc.text("Orders & Earnings Summary", w - mx, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Orders created: ${dateLabel(report)}`, mx, 66);
  doc.text(`Generated ${report.generatedAt.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, w - mx, 66, { align: "right" });
  doc.setTextColor(0);

  const t = report.total;
  autoTable(doc, {
    startY: 84,
    margin: { left: mx, right: mx },
    head: [["Orders", "Confirmed value", "Received", "Still to collect", "To refund", "Estimated (unpriced)"]],
    body: [[t.orders, php(t.value), php(t.received), php(t.toCollect), php(t.toRefund), php(t.estimated)]],
    theme: "grid",
    headStyles: { fillColor: [138, 90, 59], textColor: 255 },
    styles: { fontSize: 11, cellPadding: 7, halign: "right" },
    columnStyles: { 0: { halign: "left" } },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Totals per status", mx, doc.lastAutoTable.finalY + 28);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 36,
    margin: { left: mx, right: mx },
    head: [["Status", ...HEAD]],
    body: [
      ...report.statuses.map((s) => [STATUS_LABELS[s.status] || s.status, ...cells(s)]),
      ["Total", ...cells(t)],
    ],
    theme: "grid",
    headStyles: { fillColor: [138, 90, 59], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    didParseCell: (d) => {
      if (d.row.index === report.statuses.length) d.cell.styles.fontStyle = "bold";
    },
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Earnings by month (by order created date)", mx, doc.lastAutoTable.finalY + 28);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 36,
    margin: { left: mx, right: mx },
    head: [["Month", ...HEAD]],
    body: report.months.length
      ? [...report.months.map((m) => [m.label, ...cells(m)]), ["Total", ...cells(t)]]
      : [["No orders in this period", "", "", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: [138, 90, 59], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    didParseCell: (d) => {
      if (report.months.length && d.row.index === report.months.length) d.cell.styles.fontStyle = "bold";
    },
  });

  const notes = [
    "How the figures are worked out",
    "Confirmed value: price MDP confirmed, plus accepted changes. Rejected and cancelled orders count as 0.",
    "Received: verified deposit + paid progress/final billings, minus refunds already sent back (active orders only).",
    "Still to collect: confirmed value minus received (active orders only).",
    "Estimated (unpriced): system estimate of orders MDP has not priced yet; not included in confirmed value.",
    `To refund: ${php(t.toRefund)} of verified money on rejected/cancelled orders not yet refunded.`,
    "Tracking record only; not an official financial statement.",
  ];
  let y = doc.lastAutoTable.finalY + 30;
  if (y > doc.internal.pageSize.getHeight() - 110) {
    doc.addPage();
    y = 48;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(notes[0], mx, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  notes.slice(1).forEach((n, i) => doc.text(n, mx, y + 14 + i * 12));
  doc.save(`MDP_earnings_summary_${stamp()}.pdf`);
}

export async function exportEarningsXlsx(report) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "MDP Modular Systems";
  const money = '"₱"#,##0';
  const cols = (first) => [
    { header: first, key: "k", width: 22 },
    { header: "Orders", key: "orders", width: 10 },
    { header: "Confirmed value", key: "value", width: 18 },
    { header: "Received", key: "received", width: 16 },
    { header: "Still to collect", key: "toCollect", width: 18 },
    { header: "Estimated (unpriced)", key: "estimated", width: 20 },
    { header: "To refund", key: "toRefund", width: 14 },
  ];
  const fill = (ws) => {
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8A5A3B" } };
    ["C", "D", "E", "F", "G"].forEach((c) => (ws.getColumn(c).numFmt = money));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const sheet = (name, first, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols(first);
    rows.forEach((r) => ws.addRow(r));
    // Total row uses live SUM formulas so edits stay consistent.
    const n = rows.length;
    const tr = ws.addRow({ k: "Total" });
    ["B", "C", "D", "E", "F", "G"].forEach((c) => (tr.getCell(c).value = { formula: `SUM(${c}2:${c}${n + 1})` }));
    tr.font = { bold: true };
    fill(ws);
  };
  const row = (k, r) => ({ k, orders: r.orders, value: r.value, received: r.received, toCollect: r.toCollect, estimated: r.estimated, toRefund: r.toRefund });

  sheet("By status", "Status", report.statuses.map((s) => row(STATUS_LABELS[s.status] || s.status, s)));
  sheet("By month", "Month", report.months.map((m) => row(m.label, m)));

  const ws = wb.addWorksheet("Notes");
  ws.columns = [{ width: 110 }];
  [
    `Orders created: ${dateLabel(report)}`,
    `Generated: ${report.generatedAt.toLocaleString("en-PH")}`,
    "",
    "Confirmed value: price MDP confirmed, plus accepted changes. Rejected and cancelled orders count as 0.",
    "Received: verified deposit + paid progress/final billings, minus refunds already sent back (active orders only).",
    "Still to collect: confirmed value minus received (active orders only).",
    "Estimated (unpriced): system estimate of orders MDP has not priced yet; not part of confirmed value.",
    "To refund: verified money on rejected/cancelled orders not yet sent back.",
  ].forEach((t) => ws.addRow([t]));
  ws.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `MDP_earnings_${stamp()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
