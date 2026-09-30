"use client";

import type { SalesReport } from "./analytics";
import { loadStoreProfile, type StoreProfile } from "./store-profile";
import { REPORT_COLOURS, XPEL_LOGO_DATA_URI, xpelLogoBytes } from "./brand-assets";
import { REPORT_FONT_NAME, useReportFont } from "./report-font";
import { formatDate, formatDateTime, formatMoney } from "./utils";

function fileStem(report: SalesReport): string {
  const from = report.from.toISOString().slice(0, 10);
  const to = report.to.toISOString().slice(0, 10);
  const stem = from === to ? `xpel-sales-${from}` : `xpel-sales-${from}_to_${to}`;
  const slug = (report.filterLabel ?? "")
    .toLowerCase()
    .replace(/^search /, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `${stem}-${slug}` : stem;
}

/** Products sold, most units first, with a closing total row. */
function productsSold(report: SalesReport) {
  const products = [...report.topProducts].sort(
    (a, b) => b.quantity - a.quantity || b.revenue - a.revenue,
  );
  const total = products.reduce(
    (sum, product) => ({
      quantity: sum.quantity + product.quantity,
      revenue: sum.revenue + product.revenue,
      profit: sum.profit + product.profit,
    }),
    { quantity: 0, revenue: 0, profit: 0 },
  );
  return { products, total };
}

function periodLabel(report: SalesReport): string {
  const from = formatDate(report.from.toISOString());
  const to = formatDate(report.to.toISOString());
  return from === to ? from : `${from} — ${to}`;
}

/** The four headline figures every format leads with. */
function headline(report: SalesReport): Array<[string, string]> {
  return [
    ["Total revenue", formatMoney(report.summary.revenue)],
    ["Transactions", String(report.summary.transactions)],
    ["Items sold", String(report.summary.itemsSold)],
    ["Average basket", formatMoney(report.summary.averageBasket)],
  ];
}

function breakdown(report: SalesReport): Array<[string, string]> {
  const { summary } = report;
  return [
    ["Cash", `${formatMoney(summary.byPayment.cash.total)}  (${summary.byPayment.cash.count})`],
    ["Transfer", `${formatMoney(summary.byPayment.transfer.total)}  (${summary.byPayment.transfer.count})`],
    ["Card", `${formatMoney(summary.byPayment.card.total)}  (${summary.byPayment.card.count})`],
    ["Gross profit", formatMoney(summary.grossProfit)],
    ["Discounts given", formatMoney(summary.discountGiven)],
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

const hex = (value: string) => value.replace("#", "");
const rgb = (value: string): [number, number, number] => {
  const clean = hex(value);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
};

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export async function exportPdf(report: SalesReport): Promise<void> {
  const store = await loadStoreProfile();
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  // Embedded Unicode font — the built-in one cannot draw ₦.
  useReportFont(doc as unknown as Parameters<typeof useReportFont>[0]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const brand = rgb(REPORT_COLOURS.brand);
  const ink = rgb(REPORT_COLOURS.ink);
  const muted = rgb(REPORT_COLOURS.muted);

  // ---- Masthead -------------------------------------------------------
  doc.setFillColor(...brand);
  doc.rect(0, 0, pageWidth, 96, "F");

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 22, 54, 54, 12, 12, "F");
  doc.addImage(XPEL_LOGO_DATA_URI, "PNG", margin + 6, 28, 42, 42, undefined, "FAST");

  doc.setTextColor(255, 255, 255);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(19);
  doc.text(store.name.toUpperCase(), margin + 70, 46);

  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(9);
  const contact = [store.address, store.phone].filter(Boolean).join("  ·  ");
  // Keep the contact block clear of the period text on the right.
  const contactLines = contact
    ? (doc.splitTextToSize(contact, pageWidth - margin * 2 - 70 - 210) as string[]).slice(0, 2)
    : [];
  contactLines.forEach((line, index) => doc.text(line, margin + 70, 62 + index * 12));
  doc.setFontSize(9.5);
  doc.text("Sales Report", margin + 70, 62 + contactLines.length * 12);

  doc.setFontSize(9);
  doc.text(periodLabel(report), pageWidth - margin, 46, { align: "right" });
  doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, 60, {
    align: "right",
  });
  if (report.filterLabel) {
    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.text(`Filtered: ${report.filterLabel}`, pageWidth - margin, 74, { align: "right" });
    doc.setFont(REPORT_FONT_NAME, "normal");
  }

  // ---- Headline figures ----------------------------------------------
  const cards = headline(report);
  const gap = 12;
  const cardWidth = (pageWidth - margin * 2 - gap * (cards.length - 1)) / cards.length;

  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    const featured = index === 0;
    if (featured) {
      doc.setFillColor(...brand);
    } else {
      doc.setFillColor(...rgb(REPORT_COLOURS.tint));
    }
    doc.roundedRect(x, 116, cardWidth, 58, 10, 10, "F");

    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...(featured ? ([255, 255, 255] as [number, number, number]) : muted));
    doc.text(label.toUpperCase(), x + 14, 136);

    doc.setFont(REPORT_FONT_NAME, "bold");
    doc.setFontSize(15);
    doc.setTextColor(...(featured ? ([255, 255, 255] as [number, number, number]) : ink));
    doc.text(value, x + 14, 158);
  });

  // ---- Payment breakdown ----------------------------------------------
  autoTable(doc, {
    startY: 192,
    head: [["Breakdown", "Value"]],
    body: breakdown(report),
    theme: "plain",
    tableWidth: 300,
    margin: { left: margin },
    headStyles: {
      font: REPORT_FONT_NAME,
      fontStyle: "bold",
      fillColor: rgb(REPORT_COLOURS.tint),
      textColor: rgb(REPORT_COLOURS.brandDark),
      fontSize: 9,
    },
    styles: {
      font: REPORT_FONT_NAME,
      fontSize: 9,
      cellPadding: 6,
      textColor: ink,
      lineColor: rgb(REPORT_COLOURS.line),
      lineWidth: 0.5,
    },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });

  // ---- Products sold -------------------------------------------------
  const sold = productsSold(report);
  const afterBreakdown = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text("Products sold", margin, afterBreakdown + 28);

  autoTable(doc, {
    startY: afterBreakdown + 38,
    head: [["Product", "SKU", "Units sold", "Amount sold", "Profit"]],
    body: sold.products.map((product) => [
      product.name,
      product.sku || "—",
      product.quantity,
      formatMoney(product.revenue),
      formatMoney(product.profit),
    ]),
    foot: [
      [
        "Total",
        "",
        { content: String(sold.total.quantity), styles: { halign: "right" } },
        { content: formatMoney(sold.total.revenue), styles: { halign: "right" } },
        { content: formatMoney(sold.total.profit), styles: { halign: "right" } },
      ],
    ],
    showFoot: "lastPage",
    theme: "striped",
    margin: { left: margin, right: margin, bottom: 46 },
    headStyles: {
      font: REPORT_FONT_NAME,
      fontStyle: "bold",
      fillColor: rgb(REPORT_COLOURS.olive),
      textColor: 255,
      fontSize: 8.5,
      cellPadding: 6,
    },
    footStyles: {
      font: REPORT_FONT_NAME,
      fontStyle: "bold",
      fillColor: rgb(REPORT_COLOURS.tint),
      textColor: ink,
      fontSize: 8.5,
      cellPadding: 6,
    },
    styles: {
      font: REPORT_FONT_NAME,
      fontSize: 8,
      cellPadding: 5,
      textColor: ink,
      lineColor: rgb(REPORT_COLOURS.line),
      lineWidth: 0.4,
    },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" },
      4: { halign: "right" },
    },
  });

  // ---- Transactions ----------------------------------------------------
  let afterProducts = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  // Keep the heading with its header and first row rather than stranding it at the foot of a page.
  if (afterProducts + 80 > pageHeight - 56) {
    doc.addPage();
    afterProducts = 34;
  }

  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text("Transactions", margin, afterProducts + 28);

  autoTable(doc, {
    startY: afterProducts + 38,
    head: [["Receipt", "Date & time", "Items", "Qty", "Discount", "Total", "Payment", "Cashier", "Status"]],
    body: report.rows.map((row) => [
      row.receiptNo,
      formatDateTime(row.soldAt),
      row.items,
      row.itemCount,
      row.discount ? formatMoney(row.discount) : "—",
      formatMoney(row.total),
      row.paymentMethod,
      row.cashierName,
      row.status,
    ]),
    theme: "striped",
    margin: { left: margin, right: margin, bottom: 46 },
    headStyles: { font: REPORT_FONT_NAME, fontStyle: "bold", fillColor: brand, textColor: 255, fontSize: 8.5, cellPadding: 6 },
    alternateRowStyles: { fillColor: rgb(REPORT_COLOURS.zebra) },
    styles: {
      font: REPORT_FONT_NAME,
      fontSize: 8,
      cellPadding: 5,
      textColor: ink,
      lineColor: rgb(REPORT_COLOURS.line),
      lineWidth: 0.4,
      overflow: "linebreak",
    },
    columnStyles: {
      2: { cellWidth: 200 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
      6: { cellWidth: 62 },
    },
  });

  // ---- Footer on every page --------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);

    if (page > 1) {
      doc.setFillColor(...brand);
      doc.rect(0, 0, pageWidth, 5, "F");
      doc.addImage(XPEL_LOGO_DATA_URI, "PNG", margin, 16, 18, 18, undefined, "FAST");
      doc.setFont(REPORT_FONT_NAME, "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...ink);
      doc.text(`${store.name} — Sales Report`, margin + 24, 29);
      doc.setFont(REPORT_FONT_NAME, "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(periodLabel(report), pageWidth - margin, 29, { align: "right" });
    }
    doc.setDrawColor(...rgb(REPORT_COLOURS.line));
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);

    doc.addImage(XPEL_LOGO_DATA_URI, "PNG", margin, pageHeight - 26, 14, 14, undefined, "FAST");
    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${store.name} · Sales report · ${periodLabel(report)}`, margin + 20, pageHeight - 16);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 16, { align: "right" });
  }

  saveBlob(doc.output("blob"), `${fileStem(report)}.pdf`);
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

const FILL = (colour: string) => ({
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: `FF${hex(colour)}` },
});

const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: `FF${hex(REPORT_COLOURS.line)}` } },
  left: { style: "thin" as const, color: { argb: `FF${hex(REPORT_COLOURS.line)}` } },
  bottom: { style: "thin" as const, color: { argb: `FF${hex(REPORT_COLOURS.line)}` } },
  right: { style: "thin" as const, color: { argb: `FF${hex(REPORT_COLOURS.line)}` } },
};

const MONEY_FORMAT = '₦#,##0.00';

export async function exportExcel(report: SalesReport): Promise<void> {
  const store = await loadStoreProfile();
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = store.name;
  workbook.created = new Date();

  const logoId = workbook.addImage({ buffer: xpelLogoBytes() as unknown as ArrayBuffer, extension: "png" });

  /* ---- Summary sheet ---- */
  const summary = workbook.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  summary.columns = [{ width: 4 }, { width: 28 }, { width: 24 }, { width: 18 }, { width: 18 }];

  summary.mergeCells("B2:E2");
  const title = summary.getCell("B2");
  title.value = store.name.toUpperCase();
  title.font = { bold: true, size: 18, color: { argb: `FF${hex(REPORT_COLOURS.brand)}` } };
  title.alignment = { vertical: "middle" };
  summary.getRow(2).height = 34;

  summary.mergeCells("B3:E3");
  summary.getCell("B3").value = [store.address, store.phone].filter(Boolean).join("  ·  ");
  summary.getCell("B3").font = { size: 10, color: { argb: `FF${hex(REPORT_COLOURS.muted)}` } };

  summary.mergeCells("B4:E4");
  summary.getCell("B4").value = `Sales report · ${periodLabel(report)}`;
  summary.getCell("B4").font = { bold: true, size: 12 };

  summary.mergeCells("B5:E5");
  summary.getCell("B5").value = [
    report.filterLabel ? `Filtered: ${report.filterLabel}` : "",
    `Generated ${formatDateTime(new Date().toISOString())}`,
  ]
    .filter(Boolean)
    .join(" · ");
  summary.getCell("B5").font = { size: 9, italic: true, color: { argb: `FF${hex(REPORT_COLOURS.muted)}` } };

  summary.addImage(logoId, { tl: { col: 4.35, row: 0.35 }, ext: { width: 74, height: 74 } });

  let row = 7;
  const section = (heading: string) => {
    summary.mergeCells(`B${row}:C${row}`);
    const cell = summary.getCell(`B${row}`);
    cell.value = heading;
    cell.font = { bold: true, size: 11, color: { argb: `FF${hex(REPORT_COLOURS.brandDark)}` } };
    cell.fill = FILL(REPORT_COLOURS.tint);
    summary.getCell(`C${row}`).fill = FILL(REPORT_COLOURS.tint);
    row += 1;
  };

  const metric = (label: string, value: string | number, money = false) => {
    const labelCell = summary.getCell(`B${row}`);
    const valueCell = summary.getCell(`C${row}`);
    labelCell.value = label;
    labelCell.font = { size: 10, color: { argb: `FF${hex(REPORT_COLOURS.muted)}` } };
    valueCell.value = value;
    valueCell.font = { bold: true, size: 11 };
    valueCell.alignment = { horizontal: "right" };
    if (money) valueCell.numFmt = MONEY_FORMAT;
    labelCell.border = THIN_BORDER;
    valueCell.border = THIN_BORDER;
    row += 1;
  };

  section("Headline");
  metric("Total revenue", report.summary.revenue, true);
  metric("Transactions", report.summary.transactions);
  metric("Items sold", report.summary.itemsSold);
  metric("Average basket", report.summary.averageBasket, true);
  metric("Gross profit", report.summary.grossProfit, true);
  metric("Discounts given", report.summary.discountGiven, true);

  row += 1;
  section("Payment methods");
  metric(`Cash (${report.summary.byPayment.cash.count})`, report.summary.byPayment.cash.total, true);
  metric(`Transfer (${report.summary.byPayment.transfer.count})`, report.summary.byPayment.transfer.total, true);
  metric(`Card (${report.summary.byPayment.card.count})`, report.summary.byPayment.card.total, true);

  /* ---- Table sheets ---- */
  const addTable = (
    name: string,
    headers: Array<{ header: string; width: number; money?: boolean; number?: boolean }>,
    rows: Array<Array<string | number>>,
    accent: string,
  ) => {
    const sheet = workbook.addWorksheet(name, { views: [{ showGridLines: false, state: "frozen", ySplit: 5 }] });
    sheet.columns = headers.map((column) => ({ width: column.width }));

    sheet.mergeCells(1, 1, 1, headers.length);
    const heading = sheet.getCell(1, 1);
    heading.value = `${store.name} — ${name}`;
    heading.font = { bold: true, size: 14, color: { argb: `FF${hex(REPORT_COLOURS.brand)}` } };
    sheet.getRow(1).height = 26;

    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).value = [
      periodLabel(report),
      report.filterLabel ? `filtered: ${report.filterLabel}` : "",
      `generated ${formatDateTime(new Date().toISOString())}`,
    ]
      .filter(Boolean)
      .join(" · ");
    sheet.getCell(2, 1).font = { size: 9, color: { argb: `FF${hex(REPORT_COLOURS.muted)}` } };

    sheet.addImage(logoId, { tl: { col: headers.length - 0.9, row: 0.1 }, ext: { width: 52, height: 52 } });

    const headerRow = sheet.getRow(5);
    headers.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = FILL(accent);
      cell.alignment = { vertical: "middle", horizontal: column.money || column.number ? "right" : "left" };
      cell.border = THIN_BORDER;
    });
    headerRow.height = 22;

    rows.forEach((values, rowIndex) => {
      const sheetRow = sheet.getRow(6 + rowIndex);
      values.forEach((value, index) => {
        const cell = sheetRow.getCell(index + 1);
        cell.value = value;
        cell.border = THIN_BORDER;
        cell.font = { size: 10 };
        if (headers[index]?.money) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: "right" };
        } else if (headers[index]?.number) {
          cell.alignment = { horizontal: "right" };
        }
        if (rowIndex % 2 === 1) cell.fill = FILL(REPORT_COLOURS.zebra);
      });
    });

    sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: headers.length } };
    return sheet;
  };

  const sold = productsSold(report);
  const productsSheet = addTable(
    "Products sold",
    [
      { header: "Product", width: 38 },
      { header: "SKU", width: 16 },
      { header: "Units sold", width: 12, number: true },
      { header: "Amount sold", width: 16, money: true },
      { header: "Profit", width: 16, money: true },
    ],
    sold.products.map((product) => [
      product.name,
      product.sku,
      product.quantity,
      product.revenue,
      product.profit,
    ]),
    REPORT_COLOURS.olive,
  );
  const totalRow = productsSheet.getRow(6 + sold.products.length);
  ["Total", "", sold.total.quantity, sold.total.revenue, sold.total.profit].forEach((value, index) => {
    const cell = totalRow.getCell(index + 1);
    cell.value = value;
    cell.font = { bold: true, size: 10 };
    cell.fill = FILL(REPORT_COLOURS.tint);
    cell.border = THIN_BORDER;
    if (index >= 2) cell.alignment = { horizontal: "right" };
    if (index >= 3) cell.numFmt = MONEY_FORMAT;
  });

  addTable(
    "Transactions",
    [
      { header: "Receipt", width: 26 },
      { header: "Date & time", width: 20 },
      { header: "Items", width: 46 },
      { header: "Qty", width: 8, number: true },
      { header: "Subtotal", width: 14, money: true },
      { header: "Discount", width: 14, money: true },
      { header: "Total", width: 14, money: true },
      { header: "Payment", width: 12 },
      { header: "Customer", width: 20 },
      { header: "Cashier", width: 16 },
      { header: "Status", width: 12 },
    ],
    report.rows.map((entry) => [
      entry.receiptNo,
      formatDateTime(entry.soldAt),
      entry.items,
      entry.itemCount,
      entry.subtotal,
      entry.discount,
      entry.total,
      entry.paymentMethod,
      entry.customerName,
      entry.cashierName,
      entry.status,
    ]),
    REPORT_COLOURS.brand,
  );

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileStem(report)}.xlsx`,
  );
}

/* ------------------------------------------------------------------ */
/* Word                                                                */
/* ------------------------------------------------------------------ */

export async function exportDocx(report: SalesReport): Promise<void> {
  const store = await loadStoreProfile();
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    ImageRun,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const cell = (
    text: string,
    options: { bold?: boolean; fill?: string; colour?: string; align?: "left" | "right" } = {},
  ) =>
    new TableCell({
      shading: options.fill
        ? { type: ShadingType.CLEAR, color: "auto", fill: hex(options.fill) }
        : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [
        new Paragraph({
          alignment: options.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [
            new TextRun({
              text,
              bold: options.bold,
              size: 17,
              color: options.colour ? hex(options.colour) : undefined,
            }),
          ],
        }),
      ],
    });

  const table = (
    headers: string[],
    rows: string[][],
    accent: string,
    rightAlign: number[] = [],
  ) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((header, index) =>
            cell(header, {
              bold: true,
              fill: accent,
              colour: "#FFFFFF",
              align: rightAlign.includes(index) ? "right" : "left",
            }),
          ),
        }),
        ...rows.map(
          (values, rowIndex) =>
            new TableRow({
              children: values.map((value, index) =>
                cell(value, {
                  fill: rowIndex % 2 === 1 ? REPORT_COLOURS.zebra : undefined,
                  align: rightAlign.includes(index) ? "right" : "left",
                }),
              ),
            }),
        ),
      ],
    });

  // Masthead: logo beside the store block, borderless so it reads as a letterhead.
  const masthead = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      ...noBorder,
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            borders: noBorder,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    type: "png",
                    data: xpelLogoBytes(),
                    transformation: { width: 76, height: 76 },
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: noBorder,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: store.name.toUpperCase(),
                    bold: true,
                    size: 34,
                    color: hex(REPORT_COLOURS.brand),
                  }),
                ],
              }),
              ...[[store.address, store.phone].filter(Boolean).join("  ·  ")]
                .filter(Boolean)
                .map(
                  (line) =>
                    new Paragraph({
                      children: [new TextRun({ text: line, size: 17, color: hex(REPORT_COLOURS.muted) })],
                    }),
                ),
              new Paragraph({
                spacing: { before: 60 },
                children: [
                  new TextRun({ text: "Sales Report", bold: true, size: 22 }),
                  new TextRun({
                    text: `   ${periodLabel(report)}`,
                    size: 18,
                    color: hex(REPORT_COLOURS.muted),
                  }),
                  ...(report.filterLabel
                    ? [
                        new TextRun({
                          text: `   Filtered: ${report.filterLabel}`,
                          bold: true,
                          size: 18,
                          color: hex(REPORT_COLOURS.brand),
                        }),
                      ]
                    : []),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Generated ${formatDateTime(new Date().toISOString())}`,
                    size: 15,
                    italics: true,
                    color: hex(REPORT_COLOURS.muted),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const sold = productsSold(report);

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 140 },
      children: [new TextRun({ text, bold: true, size: 24, color: hex(REPORT_COLOURS.ink) })],
    });

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${store.name} · Sales report · ${periodLabel(report)} · page `,
                    size: 15,
                    color: hex(REPORT_COLOURS.muted),
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 15, color: hex(REPORT_COLOURS.muted) }),
                  new TextRun({ text: " of ", size: 15, color: hex(REPORT_COLOURS.muted) }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: hex(REPORT_COLOURS.muted) }),
                ],
              }),
            ],
          }),
        },
        children: [
          masthead,
          heading("Headline"),
          table(["Metric", "Value"], headline(report), REPORT_COLOURS.brand, [1]),
          heading("Breakdown"),
          table(["Item", "Value"], breakdown(report), REPORT_COLOURS.brandDark, [1]),
          heading("Products sold"),
          table(
            ["Product", "SKU", "Units sold", "Amount sold", "Profit"],
            [
              ...sold.products.map((product) => [
                product.name,
                product.sku || "—",
                String(product.quantity),
                formatMoney(product.revenue),
                formatMoney(product.profit),
              ]),
              ["TOTAL", "", String(sold.total.quantity), formatMoney(sold.total.revenue), formatMoney(sold.total.profit)],
            ],
            REPORT_COLOURS.olive,
            [2, 3, 4],
          ),
          heading("Transactions"),
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
            REPORT_COLOURS.brand,
            [3, 4],
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${fileStem(report)}.docx`);
}

/* ------------------------------------------------------------------ */
/* Inventory sheet                                                     */
/* ------------------------------------------------------------------ */

export async function exportCsvInventory(
  products: Array<{
    name: string;
    sku: string;
    category: string;
    price: number;
    costPrice?: number;
    stockQty: number;
    lowStockThreshold?: number;
  }>,
): Promise<void> {
  const store = await loadStoreProfile();
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = store.name;

  const logoId = workbook.addImage({ buffer: xpelLogoBytes() as unknown as ArrayBuffer, extension: "png" });
  const sheet = workbook.addWorksheet("Inventory", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 5 }],
  });

  const headers = [
    { header: "Product", width: 38 },
    { header: "SKU", width: 16 },
    { header: "Category", width: 18 },
    { header: "Price", width: 14, money: true },
    { header: "Cost", width: 14, money: true },
    { header: "In stock", width: 10, number: true },
    { header: "Stock value", width: 16, money: true },
  ];
  sheet.columns = headers.map((column) => ({ width: column.width }));

  sheet.mergeCells(1, 1, 1, headers.length);
  const title = sheet.getCell(1, 1);
  title.value = `${store.name} — Inventory`;
  title.font = { bold: true, size: 14, color: { argb: `FF${hex(REPORT_COLOURS.brand)}` } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell(2, 1).value = `Generated ${formatDateTime(new Date().toISOString())}`;
  sheet.getCell(2, 1).font = { size: 9, color: { argb: `FF${hex(REPORT_COLOURS.muted)}` } };

  sheet.addImage(logoId, { tl: { col: headers.length - 0.9, row: 0.1 }, ext: { width: 52, height: 52 } });

  const headerRow = sheet.getRow(5);
  headers.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = FILL(REPORT_COLOURS.brand);
    cell.alignment = { horizontal: column.money || column.number ? "right" : "left", vertical: "middle" };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 22;

  products.forEach((product, index) => {
    const row = sheet.getRow(6 + index);
    const values = [
      product.name,
      product.sku,
      product.category,
      product.price,
      product.costPrice ?? 0,
      product.stockQty,
      product.price * product.stockQty,
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      cell.border = THIN_BORDER;
      cell.font = { size: 10 };
      if (headers[column]?.money) {
        cell.numFmt = MONEY_FORMAT;
        cell.alignment = { horizontal: "right" };
      } else if (headers[column]?.number) {
        cell.alignment = { horizontal: "right" };
      }
      if (index % 2 === 1) cell.fill = FILL(REPORT_COLOURS.zebra);
    });
  });

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: headers.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `xpel-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export type { StoreProfile };
