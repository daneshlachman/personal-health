import { API } from "../utils/api";

export default function Settings({ onBack, whoopConnected, syncing, onSync, onDisconnect }) {
  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Whoop</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${whoopConnected ? "bg-green-500" : "bg-gray-300"}`} />
              {whoopConnected ? "Connected" : "Not connected"}
            </p>
          </div>
          {!whoopConnected && (
            <a href={`${API}/api/whoop/authorize`} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg font-medium">
              Connect
            </a>
          )}
        </div>

        {whoopConnected && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex-1 text-sm bg-brand-50 text-brand-600 border border-brand-200 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={onDisconnect}
              className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:text-red-500 hover:border-red-200"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
