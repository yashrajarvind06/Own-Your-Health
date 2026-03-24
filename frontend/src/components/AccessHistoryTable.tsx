import React from 'react';

interface AccessLog {
    id: number;
    doctor_name?: string;
    patient_name?: string;
    access_mode: 'NORMAL' | 'EMERGENCY';
    action: 'REQUESTED' | 'APPROVED' | 'DENIED' | 'VIEWED' | 'EXPIRED';
    timestamp: string;
    reason?: string;
    decision_by?: string;
}

interface AccessHistoryTableProps {
    logs: AccessLog[];
    role: 'patient' | 'doctor';
}

const AccessHistoryTable: React.FC<AccessHistoryTableProps> = ({ logs, role }) => {
    if (logs.length === 0) {
        return <div className="p-4 text-center text-gray-500">No access history found.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {role === 'patient' ? 'Doctor Name' : 'Patient Name'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date & Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Mode
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status / Action
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {role === 'patient' ? log.doctor_name : log.patient_name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.access_mode === 'EMERGENCY'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                                    }`}>
                                    {log.access_mode}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className={`px-2 py-1 rounded text-xs font-medium border ${log.action === 'DENIED' ? 'border-red-200 text-red-700 bg-red-50' :
                                    log.action === 'APPROVED' ? 'border-green-200 text-green-700 bg-green-50' :
                                        log.action === 'VIEWED' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                                            log.action === 'EXPIRED' ? 'border-gray-200 text-gray-600 bg-gray-50' :
                                                'border-gray-200 text-gray-600'
                                    }`}>
                                    {log.action}
                                </span>
                                {log.action === 'DENIED' && log.reason && (
                                    <div className="text-xs text-red-600 mt-1">
                                        {log.reason} (by {log.decision_by || 'SYSTEM'})
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AccessHistoryTable;
