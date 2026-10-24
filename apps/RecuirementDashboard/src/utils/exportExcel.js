import * as XLSX from 'xlsx';

export function downloadExcel(filename, columns, rows) {
  const headers = columns.map((column) => column.label);
  const body = (rows || []).map((row) =>
    columns.map((column) => {
      const value = column.value ? column.value(row) : row[column.key];
      if (value == null) return '';
      return value;
    }),
  );
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(book, name);
}
