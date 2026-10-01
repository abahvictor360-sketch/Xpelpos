"use client";

import { loadStoreProfile } from "./store-profile";
import { REPORT_COLOURS, XPEL_LOGO_DATA_URI } from "./brand-assets";
import { REPORT_FONT_NAME, useReportFont } from "./report-font";
import type { Invoice } from "./types";
import { describeQuantity } from "./units";
import { formatDate, formatDateTime, formatMoney } from "./utils";

const rgb = (value: string): [number, number, number] => {
  const clean = value.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
};

export type InvoiceDocumentKind = "invoice" | "payment";

export function invoiceFilename(invoice: Invoice, kind: InvoiceDocumentKind = "invoice"): string {
  const who = invoice.customerName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const stem = kind === "payment" ? `Payment-${invoice.invoiceNo}` : `Invoice-${invoice.invoiceNo}`;
  return `${stem}${who ? `-${who}` : ""}.pdf`;
}

/**
 * The invoice as an A4 PDF: what is downloaded, emailed and shared on
 * WhatsApp. `payment` produces the payment confirmation — the same invoice
 * stamped PAID with what was received.
 */
export async function buildInvoicePdf(invoice: Invoice, kind: InvoiceDocumentKind = "invoice"): Promise<Blob> {
  const store = await loadStoreProfile();
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  useReportFont(doc as unknown as Parameters<typeof useReportFont>[0]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const brand = rgb(REPORT_COLOURS.brand);
  const ink = rgb(REPORT_COLOURS.ink);
  const muted = rgb(REPORT_COLOURS.muted);
  const line = rgb(REPORT_COLOURS.line);
  const tint = rgb(REPORT_COLOURS.tint);

  // ---- Faded logo behind the page --------------------------------------
  const drawWatermark = () => {
    const gState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
    const setGState = (doc as unknown as { setGState: (g: unknown) => void }).setGState.bind(doc);
    setGState(new gState({ opacity: 0.05 }));
    const size = 300;
    doc.addImage(XPEL_LOGO_DATA_URI, "PNG", (pageWidth - size) / 2, (pageHeight - size) / 2, size, size, undefined, "FAST");
    setGState(new gState({ opacity: 1 }));
  };
  drawWatermark();

  // ---- Masthead ----------------------------------------------------------
  doc.setFillColor(...brand);
  doc.rect(0, 0, pageWidth, 104, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 24, 56, 56, 12, 12, "F");
  doc.addImage(XPEL_LOGO_DATA_URI, "PNG", margin + 6, 30, 44, 44, undefined, "FAST");

  doc.setTextColor(255, 255, 255);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(17);
  doc.text(store.name.toUpperCase(), margin + 70, 44);
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(8.5);
  const addressLines = (doc.splitTextToSize(store.address, 250) as string[]).slice(0, 2);
  addressLines.forEach((text, index) => doc.text(text, margin + 70, 58 + index * 11));
  doc.text([store.phone && `Tel: ${store.phone}`, store.website].filter(Boolean).join("   ·   "), margin + 70, 58 + addressLines.length * 11);

  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(22);
  doc.text(kind === "payment" ? "RECEIPT" : "INVOICE", pageWidth - margin, 48, { align: "right" });
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(9.5);
  doc.text(invoice.invoiceNo, pageWidth - margin, 64, { align: "right" });
  doc.text(
    kind === "payment" ? "Payment confirmation" : `Issued ${formatDate(invoice.issuedAt)}`,
    pageWidth - margin,
    78,
    { align: "right" },
  );

  // ---- Bill to / details -------------------------------------------------
  let y = 136;
  doc.setTextColor(...muted);
  doc.setFontSize(8);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.text("BILL TO", margin, y);
  doc.text("DETAILS", pageWidth / 2 + 20, y);
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setTextColor(...ink);
  doc.setFontSize(11);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.text(invoice.customerName || "Customer", margin, y + 16);
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(9);
  const billLines = [
    invoice.customerPhone,
    invoice.customerEmail,
    ...(invoice.customerAddress ? (doc.splitTextToSize(invoice.customerAddress, pageWidth / 2 - margin - 10) as string[]) : []),
  ].filter(Boolean);
  billLines.forEach((text, index) => doc.text(text, margin, y + 30 + index * 12));

  const details: Array<[string, string]> = [
    ["Invoice no.", invoice.invoiceNo],
    ["Date issued", formatDate(invoice.issuedAt)],
    ["Due date", invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"],
    ["Prepared by", invoice.createdBy || "—"],
  ];
  details.forEach(([label, value], index) => {
    const rowY = y + 16 + index * 13;
    doc.setTextColor(...muted);
    doc.text(label, pageWidth / 2 + 20, rowY);
    doc.setTextColor(...ink);
    doc.text(value, pageWidth - margin, rowY, { align: "right" });
  });
  y += Math.max(30 + billLines.length * 12, 16 + details.length * 13) + 18;

  // ---- Items -------------------------------------------------------------
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Item", "Qty", "Unit price", "Amount"]],
    body: invoice.items.map((item, index) => [
      String(index + 1),
      item.sku ? `${item.name}\n${item.sku}` : item.name,
      describeQuantity(item),
      formatMoney(item.unitPrice),
      formatMoney(item.lineTotal),
    ]),
    styles: { font: REPORT_FONT_NAME, fontSize: 9, textColor: ink, cellPadding: 6, lineColor: line, lineWidth: 0 },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: rgb(REPORT_COLOURS.zebra) },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: 90, halign: "right" },
      4: { cellWidth: 96, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - 70) {
      doc.addPage();
      drawWatermark();
      y = 50;
    }
  };

  // ---- Totals --------------------------------------------------------------
  const totals: Array<[string, string, boolean]> = [["Subtotal", formatMoney(invoice.subtotal), false]];
  if (invoice.discount > 0) totals.push(["Discount", `- ${formatMoney(invoice.discount)}`, false]);
  if (invoice.tax > 0) totals.push(["VAT", formatMoney(invoice.tax), false]);
  ensureRoom(totals.length * 16 + 40);
  const totalsX = pageWidth - margin - 220;
  const totalsTop = y;
  const totalsPage = doc.getNumberOfPages();
  doc.setFontSize(9.5);
  totals.forEach(([label, value]) => {
    doc.setTextColor(...muted);
    doc.text(label, totalsX, y);
    doc.setTextColor(...ink);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += 16;
  });
  doc.setFillColor(...brand);
  doc.roundedRect(totalsX - 10, y - 6, 230, 30, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(12);
  doc.text(kind === "payment" ? "Total" : "Amount due", totalsX, y + 13);
  doc.text(formatMoney(invoice.total), pageWidth - margin - 4, y + 13, { align: "right" });
  doc.setFont(REPORT_FONT_NAME, "normal");
  y += 46;

  // ---- Payment box ---------------------------------------------------------
  ensureRoom(110);
  if (kind === "payment") {
    doc.setFillColor(...rgb("#EEF2D6"));
    doc.roundedRect(margin, y, pageWidth - margin * 2, 84, 10, 10, "F");
    doc.setTextColor(...rgb("#4F5600"));
    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.setFontSize(10);
    doc.text("PAYMENT RECEIVED — THANK YOU", margin + 16, y + 22);
    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...ink);
    doc.text(`Amount received: ${formatMoney(invoice.paidAmount || invoice.total)}`, margin + 16, y + 42);
    doc.text(`Date: ${invoice.paidAt ? formatDateTime(invoice.paidAt) : "—"}`, margin + 16, y + 56);
    if (invoice.paymentReference) doc.text(`Reference: ${invoice.paymentReference}`, margin + 16, y + 70);
    doc.text(`Paid into: ${invoice.accountName} · ${invoice.bankName} ${invoice.accountNumber}`, pageWidth / 2, y + 42);
    const balance = invoice.total - (invoice.paidAmount || invoice.total);
    if (balance > 0.005) doc.text(`Balance outstanding: ${formatMoney(balance)}`, pageWidth / 2, y + 56);

    // PAID stamp
    doc.setDrawColor(...rgb("#4F5600"));
    doc.setLineWidth(2);
    doc.setTextColor(...rgb("#4F5600"));
    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.setFontSize(26);
    // On the empty left of the totals, on the same page as them.
    doc.setPage(totalsPage);
    doc.roundedRect(margin + 10, totalsTop - 6, 120, 44, 6, 6, "S");
    doc.text("PAID", margin + 70, totalsTop + 25, { align: "center" });
    doc.setPage(doc.getNumberOfPages());
    doc.setFont(REPORT_FONT_NAME, "normal");
    y += 100;
  } else {
    doc.setFillColor(...tint);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 92, 10, 10, "F");
    doc.setTextColor(...brand);
    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.setFontSize(9);
    doc.text("PAY BY BANK TRANSFER", margin + 16, y + 22);
    doc.setTextColor(...muted);
    doc.setFont(REPORT_FONT_NAME, "normal");
    const rows: Array<[string, string]> = [
      ["Bank", invoice.bankName],
      ["Account number", invoice.accountNumber],
      ["Account name", invoice.accountName],
    ];
    rows.forEach(([label, value], index) => {
      const rowY = y + 42 + index * 16;
      doc.setTextColor(...muted);
      doc.setFontSize(9);
      doc.text(label, margin + 16, rowY);
      doc.setTextColor(...ink);
      doc.setFont(REPORT_FONT_NAME, "bold");
      doc.setFontSize(index === 1 ? 12 : 10);
      doc.text(value, margin + 130, rowY);
      doc.setFont(REPORT_FONT_NAME, "normal");
    });
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(`Use ${invoice.invoiceNo} as the transfer narration.`, pageWidth - margin - 16, y + 74, { align: "right" });
    y += 108;
  }

  // ---- Notes ---------------------------------------------------------------
  if (invoice.notes) {
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2) as string[];
    ensureRoom(noteLines.length * 12 + 24);
    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("NOTES", margin, y);
    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text(noteLines, margin, y + 14);
  }

  // ---- Footer on every page --------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.6);
    doc.line(margin, pageHeight - 46, pageWidth - margin, pageHeight - 46);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(
      [store.name, store.phone, store.website].filter(Boolean).join("   ·   "),
      margin,
      pageHeight - 30,
    );
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 30, { align: "right" });
  }

  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
