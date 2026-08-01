import { CloseIcon } from "./Icons";

export default function DeleteConfirmDialog({sessionName, onConfirm, onClose}) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-300 transition"
                    title="Close"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </button>
                    <h2 className="text-sm font-semibold text-white">Delete Session</h2>
                    <div className="w-4" />
                </div>

                {/* Body */}
                <div className="px-5 py-5">
                    <p className="text-sm text-gray-300">
                        Are you sure you want to delete session{" "}
                        <span className="text-white font-medium">'{sessionName}'</span>?
                        This action cannot be undone.
                    </p>
                </div>

                {/* Footer */}
                <div className="flex gap-2 px-5 pb-5">
                    <button
                    onClick={onClose}
                    className="flex-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl font-medium transition"
                    >
                        Cancel
                    </button>
                    <button
                    onClick={onConfirm}
                    className="flex-1 text-sm bg-red-600 hover:bg-red-500 active:bg-red-700 text-white py-2 rounded-xl font-medium transition"
                    >
                        Delete                    
                    </button>
                </div>
            </div>
        </div>
    )
}