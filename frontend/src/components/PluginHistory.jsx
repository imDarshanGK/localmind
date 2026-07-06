import { useEffect, useState } from "react";
import { getPluginLogs } from "../utils/api";

export default function PluginHistory() {
  const [logs, setLogs] = useState([]);
  const [pluginFilter, setPluginFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedLog, setExpandedLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const data = await getPluginLogs(100);
      setLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = logs.filter((log) => {
    const pluginMatch =
      !pluginFilter ||
      log.plugin.toLowerCase().includes(pluginFilter.toLowerCase());

    const logDate = new Date(
    log.created_at.replace(" ", "T") + "Z"
);

const startMatch =
    !startDate ||
    logDate >= new Date(`${startDate}T00:00:00Z`);

const endMatch =
    !endDate ||
    logDate <= new Date(`${endDate}T23:59:59Z`);

    const startMatch =
      !startDate || logDate >= new Date(startDate);

    const endMatch =
      !endDate || logDate <= new Date(endDate + "T23:59:59");

    return pluginMatch && startMatch && endMatch;
  });

  if (loading) {
    return (
      <div className="p-4 text-gray-400">
        Loading plugin history...
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-lg font-semibold">
          Plugin History
        </h2>

        <button
          onClick={fetchLogs}
          className="text-xs px-3 py-1 rounded bg-purple-700 hover:bg-purple-600"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">

        <input
          type="text"
          placeholder="Plugin..."
          value={pluginFilter}
          onChange={(e) => setPluginFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        />

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        />

      </div>

      {filteredLogs.length === 0 ? (
        <p className="text-gray-500">
          No plugin history found.
        </p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">

          {filteredLogs.map((log) => (

            <div
              key={log.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4"
            >

              <div className="flex justify-between items-center">

                <h3 className="text-purple-400 font-semibold capitalize">
                  {log.plugin}
                </h3>

                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    log.success
                      ? "bg-green-900/50 text-green-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {log.success ? "Success" : "Failure"}
                </span>

              </div>

              <div className="text-[11px] text-gray-500 mt-1">
                {new Date(log.created_at + "Z").toLocaleString()}
              </div>

              <div className="mt-3">

                <div className="text-xs font-semibold text-gray-300">
                  Input
                </div>

                <div className="text-sm text-gray-400 whitespace-pre-wrap">
                  {expandedLog === log.id
                    ? log.input
                    : (log.input || "").slice(0, 100)}

                  {expandedLog !== log.id &&
                    log.input &&
                    log.input.length > 100 &&
                    "..."}
                </div>

              </div>

              <div className="mt-3">

                <div className="text-xs font-semibold text-gray-300">
                  Output
                </div>

                <div className="text-sm text-gray-400 whitespace-pre-wrap">
                  {expandedLog === log.id
                    ? log.output
                    : (log.output || "").slice(0, 100)}

                  {expandedLog !== log.id &&
                    log.output &&
                    log.output.length > 100 &&
                    "..."}
                </div>

              </div>

              <button
                onClick={() =>
                  setExpandedLog(
                    expandedLog === log.id ? null : log.id
                  )
                }
                className="mt-3 text-purple-400 text-sm hover:underline"
              >
                {expandedLog === log.id
                  ? "Show Less"
                  : "Show More"}
              </button>

            </div>

          ))}

        </div>
      )}

    </div>
  );
}
