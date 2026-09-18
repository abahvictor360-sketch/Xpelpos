"use client";

import type { SalesReport } from "./analytics";
import { formatDate, formatDateTime, formatMoney } from "./utils";

const STORE_NAME = "Xpel Beauty NG";

function fileStem(report: SalesReport): string {
  const from = report.from.toISOString().slice(0, 10);
  const to = report.to.toISOString().slice(0, 10);
  return from === to ? `xpel-sales-${from}` : `xpel-sales-${from}_to_${to}`;
}

function summaryPairs(report: SalesReport): Array<[string, string]> {
  const { summary } = report;
  return [
    ["Period", `${formatDate(report.from.toISOString())} - ${formatDate(report.to.toISOString())}`],
    ["Total revenue", formatMoney(summary.revenue)],
    ["Transactions", String(summary.transactions)],
    ["Items sold", String(summary.itemsSold)],
    ["Average basket", formatMoney(summary.averageBasket)],
    ["Gross profit", formatMoney(summary.grossProfit)],
    ["Discounts given", formatMoney(summary.discountGiven)],
    ["Cash", `${formatMoney(summary.byPayment.cash.total)} (${summary.byPayment.cash.count})`],
    ["Transfer", `${formatMoney(summary.byPayment.transfer.total)} (${summary.byPayment.transfer.count})`],
    ["Card", `${formatMoney(summary.byPayment.card.total)} (${summary.byPayment.card.count})`],
  ];
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportExcel(report: SalesReport): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [`${STORE_NAME} — Sales Report`],
    [],
    ...summaryPairs(report),
  ]);
  summarySheet["!cols"] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const transactionSheet = XLSX.utils.json_to_sheet(
    report.rows.map((row) => ({
      Receipt: row.receiptNo,
      "Date & time": formatDateTime(row.soldAt),
      Items: row.items,
      Qty: row.itemCount,
      Subtotal: row.subtotal,
      Discount: row.discount,
      Total: row.total,
      Payment: row.paymentMethod,
      Customer: row.customerName,
      Cashier: row.cashierName,
      Status: row.status,
    })),
  );
  transactionSheet["!cols"] = [
    { wch: 24 }, { wch: 20 }, { wch: 42 }, { wch: 6 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");

  const productSheet = XLSX.utils.json_to_sheet(
    report.topProducts.map((product) => ({
      Product: product.name,
      SKU: product.sku,
      "Qty sold": product.quantity,
      Revenue: product.revenue,
      Profit: product.profit,
    })),
  );
  productSheet["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, productSheet, "Products");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileStem(report)}.xlsx`,
  );
}

export async function exportPdf(report: SalesReport): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const brand: [number, number, number] = [207, 109, 30];

  doc.setFontSize(18);
  doc.setTextColor(...brand);
  doc.text(`${STORE_NAME} — Sales Report`, 40, 44);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `${formatDate(report.from.toISOString())} to ${formatDate(report.to.toISOString())}  ·  generated ${formatDateTime(new Date().toISOString())}`,
    40,
    62,
  );

  autoTable(doc, {
    startY: 80,
    head: [["Summary", "Value"]],
    body: summaryPairs(report),
    theme: "grid",
    headStyles: { fillColor: brand, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 200 } },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 24,
    head: [["Receipt", "Date & time", "Items", "Qty", "Total", "Payment", "Cashier", "Status"]],
    body: report.rows.map((row) => [
      row.receiptNo,
      formatDateTime(row.soldAt),
      row.items,
      row.itemCount,
      formatMoney(row.total),
      row.paymentMethod,
      row.cashierName,
      row.status,
    ]),
    theme: "striped",
    headStyles: { fillColor: brand, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    columnStyles: { 2: { cellWidth: 220 } },
  });

  if (report.topProducts.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 24,
      head: [["Product", "SKU", "Qty sold", "Revenue", "Profit"]],
      body: report.topProducts
        .slice(0, 40)
        .map((p) => [p.name, p.sku, p.quantity, formatMoney(p.revenue), formatMoney(p.profit)]),
      theme: "striped",
      headStyles: { fillColor: [168, 180, 0], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
    });
  }

  saveBlob(doc.output("blob"), `${fileStem(report)}.pdf`);
}

export async function exportDocx(report: SalesReport): Promise<void> {
  const {
    Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell,
    TextRun, WidthType, AlignmentType,
  } = await import("docx");

  const cell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
    });

  const table = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((h) => cell(h, true)), tableHeader: true }),
        ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
      ],
    });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${STORE_NAME} — Sales Report`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: `${formatDate(report.from.toISOString())} to ${formatDate(report.to.toISOString())} · generated ${formatDateTime(new Date().toISOString())}`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }),
          table(["Metric", "Value"], summaryPairs(report).map(([k, v]) => [k, v])),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Transactions", heading: HeadingLevel.HEADING_2 }),
          table(
            ["Receipt", "Date & time", "Items", "Qty", "Total", "Payment", "Status"],
            report.rows.map((row) => [
              row.receiptNo,
              formatDateTime(row.soldAt),
              row.items,
              String(row.itemCount),
              formatMoney(row.total),
              row.paymentMethod,
              row.status,
            ]),
          ),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Product performance", heading: HeadingLevel.HEADING_2 }),
          table(
            ["Product", "SKU", "Qty sold", "Revenue", "Profit"],
            report.topProducts.map((p) => [
              p.name,
              p.sku,
              String(p.quantity),
              formatMoney(p.revenue),
              formatMoney(p.profit),
            ]),
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${fileStem(report)}.docx`);
}

export async function exportCsvInventory(
  products: Array<{ name: string; sku: string; category: string; price: number; stockQty: number }>,
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(
    products.map((p) => ({
      Product: p.name,
      SKU: p.sku,
      Category: p.category,
      Price: p.price,
      "In stock": p.stockQty,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `xpel-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
