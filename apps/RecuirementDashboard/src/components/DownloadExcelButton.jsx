import { downloadExcel } from '../utils/exportExcel';

export default function DownloadExcelButton({ filename, columns, rows }) {
  return (
    <div className="excel-download-row">
      <button
        type="button"
        className="btn btn-secondary excel-download-btn"
        onClick={() => downloadExcel(filename, columns, rows)}
      >
        Download Excel
      </button>
    </div>
  );
}
